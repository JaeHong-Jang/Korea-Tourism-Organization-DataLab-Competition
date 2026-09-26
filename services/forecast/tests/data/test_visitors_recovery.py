"""월말 미제공 응답에서 받은 날짜를 저장하고 누락 구간만 재개하는지 검증한다."""

import copy
import json
from collections.abc import Callable
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
import polars as pl
import pytest
from crowdcast.data import visitors
from crowdcast.data.visitors import IncompleteVisitors, collect_visitors


# 8월 전체 요청에 25일까지만 오는 실제 실패 구조를 작은 녹화본 변형으로 재현한다.
def test_partial_month_saved_and_only_gap_requested(
    datago_factory: Callable, datago_recordings: list[dict[str, Any]], tmp_path: Path
) -> None:
    requests = []

    # 두 번째 실행에서는 첫 실행에서 누락된 6일만 서버에 요청해야 한다.
    def respond(request: httpx.Request) -> httpx.Response:
        first, last = request.url.params["startYmd"], request.url.params["endYmd"]
        requests.append((first, last))
        start, end = (
            (date(2026, 8, 1), date(2026, 8, 25))
            if len(requests) == 1
            else (date(2026, 8, 26), date(2026, 8, 31))
        )
        payload = copy.deepcopy(datago_recordings[0]["payload"])
        body = payload["response"]["body"]
        original = body["items"]["item"][0]
        rows = [
            {**original, "baseYmd": (start + timedelta(days=n)).strftime("%Y%m%d")}
            for n in range((end - start).days + 1)
        ]
        body.update(totalCount=len(rows), items={"item": rows})
        return httpx.Response(200, json=payload)

    output = tmp_path / "region_daily.parquet"
    with pytest.raises(IncompleteVisitors, match="2026-08-26.*2026-08-31"):
        collect_visitors(datago_factory(respond=respond), date(2026, 8, 1), date(2026, 8, 31), output=output)
    assert pl.read_parquet(output).height == 25
    checkpoint = json.loads(output.with_suffix(".progress.json").read_text())
    assert len(checkpoint["completed_dates"]) == 25
    assert checkpoint["unavailable_intervals"] == [{"from": "2026-08-26", "to": "2026-08-31"}]
    result = collect_visitors(
        datago_factory(respond=respond), date(2026, 8, 1), date(2026, 8, 31), output=output
    )
    assert result.height == 31
    assert requests == [("20260801", "20260831"), ("20260826", "20260831")]
    assert json.loads(output.with_suffix(".progress.json").read_text())["unavailable_intervals"] == []


# 빈 응답을 완료로 기록하지 않으며 누락 날짜와 호출 수를 CLI에 남긴다.
def test_empty_month_remains_pending(
    datago_factory: Callable,
    datago_recordings: list[dict[str, Any]],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture,
) -> None:
    payload = copy.deepcopy(datago_recordings[0]["payload"])
    payload["response"]["body"].update(totalCount=0, items="")
    client = datago_factory(respond=lambda _: httpx.Response(200, json=payload))
    monkeypatch.setattr(visitors, "PROCESSED", tmp_path)
    monkeypatch.setattr(visitors, "DataGoClient", lambda **_: client)
    assert visitors.main(["--from", "2026-08-26", "--to", "2026-08-31"]) == 2
    report = json.loads(capsys.readouterr().out)
    assert report["status"] == "paused" and report["calls"] == 1
    assert "수신 0행" in report["reason"] and "2026-08-26" in report["reason"]
    checkpoint = json.loads((tmp_path / "region_daily.progress.json").read_text())
    assert checkpoint["completed_dates"] == []
    assert checkpoint["unavailable_intervals"] == [{"from": "2026-08-26", "to": "2026-08-31"}]


# 키가 담긴 하위 예외도 원인 종류·페이지 진단을 유지하면서 CLI에서는 가린다.
def test_cli_error_reason_redacted(
    datago_factory: Callable,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture,
) -> None:
    client = datago_factory()
    monkeypatch.setattr(visitors, "DataGoClient", lambda **_: client)

    # 파일·파서 오류의 자유문구에 키와 URL 인코딩 키가 섞인 상황을 재현한다.
    def fail(*args: Any, **kwargs: Any) -> None:
        secret = "fixture-only-token+/="
        raise OSError(f"캐시 저장 실패 page=2: {secret} {quote(secret, safe='')}")

    monkeypatch.setattr(visitors, "collect_visitors", fail)
    assert visitors.main(["--from", "2025-09-01", "--to", "2025-09-07"]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["error_type"] == "OSError" and report["calls"] == 0
    assert "캐시 저장 실패 page=2" in report["reason"]
    assert "fixture-only" not in report["reason"]
