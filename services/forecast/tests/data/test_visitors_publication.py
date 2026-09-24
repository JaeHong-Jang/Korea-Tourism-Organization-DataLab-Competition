"""35일 공개 지연과 공개 전 응답의 재조회·체크포인트 보존을 검증한다."""

import copy
import hashlib
import json
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import polars as pl
import pytest
from crowdcast.data import visitors
from crowdcast.data.call_ledger import CallLimitReached
from crowdcast.data.visitors import IncompleteVisitors, collect_visitors, normalize_visitors
from test_visitors import END, START, recorded_pages


# 달·윤년·연도 경계에서도 35일을 빠짐없이 적용한다.
@pytest.mark.parametrize(
    "observed,available",
    [("20240201", date(2024, 3, 7)), ("20251231", date(2026, 2, 4)), ("20260825", date(2026, 9, 29))],
)
def test_publication_boundaries(
    datago_recordings: list[dict[str, Any]], observed: str, available: date
) -> None:
    recording = copy.deepcopy(datago_recordings[0])
    body = recording["payload"]["response"]["body"]
    item = {**body["items"]["item"][0], "baseYmd": observed}
    body.update(totalCount=1, items={"item": item})
    assert normalize_visitors(recorded_pages([recording]))["available_at"][0] == available


# 완료 체크포인트가 있어도 옛 공개일을 보정하고 요청 범위 밖의 기존 행까지 저장한다.
def test_completed_output_migrates_without_calls(datago_factory: Callable, tmp_path: Path) -> None:
    output = tmp_path / "region_daily.parquet"
    expected = collect_visitors(datago_factory(), START, END, output=output)
    old = expected.with_columns((pl.col("date") + pl.duration(days=4)).alias("available_at"))
    visitors.save_progress(output, old, set(old["date"]), {date(2026, 8, 26)})
    checkpoint = output.with_suffix(".progress.json")
    metadata = json.loads(checkpoint.read_bytes())
    metadata.pop("visitors_lag_days")
    checkpoint.write_text(json.dumps(metadata))
    client = datago_factory(max_calls=0)
    result = collect_visitors(client, START, START, output=output)
    assert result.height == 792 and client.ledger.calls == 0
    assert pl.read_parquet(output).equals(expected)
    metadata = json.loads(checkpoint.read_bytes())
    assert metadata["parquet_sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()
    assert metadata["visitors_lag_days"] == 35
    assert len(metadata["completed_dates"]) == 7
    assert metadata["unavailable_intervals"] == [{"from": "2026-08-26", "to": "2026-08-26"}]


# 기존 빈 캐시는 무효화하고 호출 예산이 0이면 전송하지 않은 채 중단한다.
@pytest.mark.parametrize("max_calls", [0, 1])
def test_legacy_empty_cache_invalidated(
    datago_factory: Callable, datago_recordings: list[dict[str, Any]], max_calls: int
) -> None:
    params = {"startYmd": "20250901", "endYmd": "20250907"}
    seeded = datago_factory()
    seeded.page("visitors", params)
    cached = next((seeded.cache_dir / "visitors").glob("*.json"))
    empty = copy.deepcopy(datago_recordings[0])
    empty["payload"]["response"]["body"].update(totalCount=0, numOfRows=0, items="")
    cached.write_text(json.dumps(empty))
    resumed = datago_factory(max_calls=max_calls)
    if max_calls:
        assert resumed.page("visitors", params).total_count == 5544
        assert cached.exists()
    else:
        with pytest.raises(CallLimitReached):
            resumed.page("visitors", params)
        assert not cached.exists()
    assert resumed.ledger.calls == max_calls


# 공개 전 구간은 같은 요청으로 재조회하며 자료가 생기면 미공개 기록만 해제한다.
def test_empty_then_published_resumes(
    datago_factory: Callable, datago_recordings: list[dict[str, Any]], tmp_path: Path
) -> None:
    output = tmp_path / "region_daily.parquet"
    payload = copy.deepcopy(datago_recordings[0]["payload"])
    payload["response"]["body"].update(totalCount=0, items="")
    first = datago_factory(respond=lambda _: httpx.Response(200, json=payload))
    with pytest.raises(IncompleteVisitors):
        collect_visitors(first, START, END, output=output)
    assert not list((first.cache_dir / "visitors").glob("*.json"))
    second = datago_factory(max_calls=6)
    assert collect_visitors(second, START, END, output=output).height == 5544
    assert second.ledger.calls == 6
    progress = json.loads(output.with_suffix(".progress.json").read_bytes())
    assert len(progress["completed_dates"]) == 7 and progress["unavailable_intervals"] == []


# 수집은 최근 공개 여부를 확인할 수 있고 피처의 공개 시점은 별도로 35일을 적용한다.
def test_recent_dates_can_be_probed(
    datago_factory: Callable, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(visitors, "korea_today", lambda: END)
    frame = collect_visitors(datago_factory(), START, END, output=tmp_path / "region_daily.parquet")
    assert frame["available_at"].min() == date(2025, 10, 6)
    with pytest.raises(ValueError):
        collect_visitors(datago_factory(max_calls=0), START, date(2025, 9, 8), output=tmp_path / "other")
