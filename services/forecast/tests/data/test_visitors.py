"""실제 방문자 녹화본으로 부모 시·공개일·소수 보존과 중단 후 복구를 검증한다."""

import copy
import hashlib
import json
from collections.abc import Callable
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import pandera.polars as pa
import polars as pl
import pytest
from crowdcast.data import visitors
from crowdcast.data.call_ledger import CallLimitReached
from crowdcast.data.datago_client import DataGoClient, DataGoError
from crowdcast.data.visitors import PARENT_CITY_CODES, collect_visitors, normalize_visitors

START, END = date(2025, 9, 1), date(2025, 9, 7)


# 녹화본은 실제 캐시와 동일한 형식으로 읽어 원본 해시를 유지한다.
def recorded_pages(recordings: list[dict[str, Any]]) -> list:
    return [
        DataGoClient._parse(json.dumps(value, ensure_ascii=False, sort_keys=True).encode(), i, 1000)
        for i, value in enumerate(recordings, start=1)
    ]


# 부모 시가 포함된 원본과 합산에 쓸 252개 지역을 명확히 구분한다.
def test_parent_cities_and_availability(datago_recordings: list[dict[str, Any]]) -> None:
    frame = normalize_visitors(recorded_pages(datago_recordings))
    assert frame.height == 5544
    assert frame["sigungu_code"].n_unique() == 264
    assert set(frame.filter(pl.col("is_parent_city"))["sigungu_code"]) == PARENT_CITY_CODES
    assert frame.filter(~pl.col("is_parent_city"))["sigungu_code"].n_unique() == 252
    assert frame.filter(pl.col("is_parent_city")).height == 12 * 7 * 3
    assert frame.filter(pl.col("available_at") != pl.col("date") + pl.duration(days=35)).is_empty()
    assert set(frame["tou_div"]) == {"현지인", "외지인", "외국인"}
    jongno = frame.filter(
        (pl.col("sigungu_code") == "11110") & (pl.col("date") == START) & (pl.col("tou_div") == "외국인")
    )
    assert jongno["visitors"][0] == 23663.620000000003
    assert frame.filter(pl.col("sigungu_code").str.starts_with("51")).height > 0
    assert frame.filter(pl.col("sigungu_code").str.starts_with("52")).height > 0


# 연말 관측값도 다음 해 공개일로 계산한다.
def test_availability_crosses_year(datago_recordings: list[dict[str, Any]]) -> None:
    recording = copy.deepcopy(datago_recordings[0])
    body = recording["payload"]["response"]["body"]
    item = body["items"]["item"][0]
    item["baseYmd"] = "20191229"
    body.update(totalCount=1, items={"item": [item]})
    frame = normalize_visitors(recorded_pages([recording]))
    assert frame["available_at"][0] == date(2020, 2, 2)


# 잘못된 필드나 중복 관측을 완료 산출물로 확정하지 않는다.
@pytest.mark.parametrize(
    "field,value",
    [("touNum", "-1"), ("touNum", "inf"), ("touNum", "nan"), ("touDivCd", "4"), ("baseYmd", "20250230")],
)
def test_invalid_observations_rejected(
    datago_recordings: list[dict[str, Any]], field: str, value: str
) -> None:
    recordings = copy.deepcopy(datago_recordings)
    recordings[0]["payload"]["response"]["body"]["items"]["item"][0][field] = value
    with pytest.raises((DataGoError, pa.errors.SchemaError)):
        normalize_visitors(recorded_pages(recordings))


# 같은 시군구·날짜·방문자 구분이 두 번 나오면 합산하거나 덮어쓰지 않는다.
def test_duplicate_observation_rejected(datago_recordings: list[dict[str, Any]]) -> None:
    recordings = copy.deepcopy(datago_recordings)
    rows = recordings[0]["payload"]["response"]["body"]["items"]["item"]
    rows[1] = rows[0].copy()
    with pytest.raises(pa.errors.SchemaError):
        normalize_visitors(recorded_pages(recordings))


# 페이지 중간에 한도가 끝나도 재실행은 남은 네 페이지만 전송한다.
def test_resume_after_call_limit(datago_factory: Callable, tmp_path: Path) -> None:
    output = tmp_path / "region_daily.parquet"
    first = datago_factory(max_calls=2)
    with pytest.raises(CallLimitReached):
        collect_visitors(first, START, END, output=output)
    assert first.ledger.calls == 2 and not output.exists()
    second = datago_factory(max_calls=4)
    frame = collect_visitors(second, START, END, output=output)
    assert second.ledger.calls == 4 and frame.height == 5544
    checkpoint = json.loads(output.with_suffix(".progress.json").read_text())
    assert checkpoint["parquet_sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()
    third = datago_factory(max_calls=0)
    assert collect_visitors(third, START, END, output=output).equals(frame)
    assert collect_visitors(third, START + timedelta(days=1), END, output=output).height == 6 * 792
    assert third.ledger.calls == 0


# 체크포인트 저장 직전 중단돼도 Parquet을 중복시키지 않고 캐시로 복구한다.
def test_resume_after_checkpoint_write_failure(
    datago_factory: Callable,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    output = tmp_path / "region_daily.parquet"
    original = visitors.atomic_write

    # 데이터 파일은 저장하고 완료 표시 저장에서만 전원 중단을 모사한다.
    def interrupt(path: Path, raw: bytes) -> None:
        if path.suffix == ".json":
            raise OSError("체크포인트 쓰기 실패")
        original(path, raw)

    monkeypatch.setattr(visitors, "atomic_write", interrupt)
    with pytest.raises(OSError):
        collect_visitors(datago_factory(), START, END, output=output)
    assert output.exists()
    monkeypatch.setattr(visitors, "atomic_write", original)
    resumed = datago_factory(max_calls=0)
    assert collect_visitors(resumed, START, END, output=output).height == 5544
    assert resumed.ledger.calls == 0


# 삭제되거나 체크포인트와 달라진 산출물은 완료 날짜를 믿지 않고 복구한다.
@pytest.mark.parametrize("delete", [True, False])
def test_rebuild_missing_or_changed_output(datago_factory: Callable, tmp_path: Path, delete: bool) -> None:
    output = tmp_path / "region_daily.parquet"
    expected = collect_visitors(datago_factory(), START, END, output=output)
    if delete:
        output.unlink()
    else:
        expected.with_columns(pl.lit(0.0).alias("visitors")).write_parquet(output)
    resumed = datago_factory(max_calls=0)
    assert collect_visitors(resumed, START, END, output=output).equals(expected)


# 2018년에는 외국인 관측을 만들어 채우지 않고 완료된 앞 달부터 건너뛴다.
def test_month_checkpoint_and_pre_foreign_history(
    datago_factory: Callable,
    datago_recordings: list[dict[str, Any]],
    tmp_path: Path,
) -> None:
    requested = []

    # 실제 국내 관측 두 행을 과거 월말·월초 경계로 옮긴 변형 응답이다.
    def respond(request: httpx.Request) -> httpx.Response:
        first, last = request.url.params["startYmd"], request.url.params["endYmd"]
        requested.append((first, last))
        payload = copy.deepcopy(datago_recordings[0]["payload"])
        rows = payload["response"]["body"]["items"]["item"][:2]
        for row in rows:
            row["baseYmd"] = first
        payload["response"]["body"].update(totalCount=2, items={"item": rows})
        return httpx.Response(200, json=payload)

    output = tmp_path / "region_daily.parquet"
    with pytest.raises(CallLimitReached):
        collect_visitors(
            datago_factory(max_calls=1, respond=respond), date(2018, 1, 31), date(2018, 2, 1), output=output
        )
    assert pl.read_parquet(output).height == 2
    resumed = datago_factory(max_calls=1, respond=respond)
    frame = collect_visitors(resumed, date(2018, 1, 31), date(2018, 2, 1), output=output)
    assert frame.height == 4 and set(frame["tou_div"]) == {"현지인", "외지인"}
    assert requested == [("20180131", "20180131"), ("20180201", "20180201")]


# 받은 날짜는 보존하고 응답에 없는 날짜만 미완료로 남긴다.
def test_missing_date_cannot_complete(datago_factory: Callable, tmp_path: Path) -> None:
    output = tmp_path / "region_daily.parquet"
    with pytest.raises(DataGoError, match="날짜"):
        collect_visitors(datago_factory(), START, END + timedelta(days=1), output=output)
    assert pl.read_parquet(output).height == 5544
    completed = json.loads(output.with_suffix(".progress.json").read_text())["completed_dates"]
    assert len(completed) == 7 and "2025-09-08" not in completed


# 실제 CLI 진입점의 완료·한도 중단을 종료 코드와 구조화된 출력으로 검증한다.
def test_cli_success_and_cached_resume(
    datago_factory: Callable,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture,
) -> None:
    monkeypatch.setattr(visitors, "PROCESSED", tmp_path)
    monkeypatch.setattr(visitors, "DataGoClient", datago_factory)
    args = ["--from", "2025-09-01", "--to", "2025-09-07", "--max-calls"]
    assert visitors.main([*args, "2"]) == 2
    assert json.loads(capsys.readouterr().out)["calls"] == 2
    assert visitors.main([*args, "4"]) == 0
    assert json.loads(capsys.readouterr().out) == {
        "status": "complete",
        "rows": 5544,
        "sigungu_count": 264,
        "parent_city_count": 12,
        "calls": 4,
    }
    assert visitors.main([*args, "0"]) == 0
    assert json.loads(capsys.readouterr().out)["calls"] == 0
