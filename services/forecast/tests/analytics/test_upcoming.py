"""일괄 예보의 범위·제외 집계·반복 발행·직전 수 경고를 검사한다."""

import json
from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast.analytics import upcoming
from crowdcast.api.assemble import inputs
from crowdcast.api.assemble.http import NoObservation
from crowdcast.data.events import EVENT_DTYPES


# 시작일 범위의 양끝을 포함하고 기간이 겹쳐도 시작이 범위 밖이면 제외한다.
def test_boundaries_and_missing_reasons(batch_data: Path, master_row: dict, recorded_forecast: list) -> None:
    changes = [
        {"start": date(2026, 9, 28)},
        {"start": date(2026, 9, 29)},
        {"start": date(2026, 11, 30)},
        {"start": date(2026, 12, 1)},
        {"start": None},
        {"end": None},
        {"sigungu_code": None, "sigungu_name": None},
        {"lat": None, "lng": None},
        {"end": None, "lat": None},
    ]
    rows = [{**master_row, "end": date(2026, 12, 5), "event_id": f"e-jinju-2026-{i}", **change}
            for i, change in enumerate(changes)]
    pl.from_dicts(rows, schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    report = upcoming.run_batch()
    assert len(recorded_forecast) == 2
    assert all(event["timeOfDay"] == "미상" for event in recorded_forecast)
    assert "범위 내 시작일 수: 6" in report and "입력 가능 수: 2" in report
    assert "시작일 미확정 수(전체 마스터, 범위 판정 불가): 1" in report
    assert "범위 밖 시작일 수: 2" in report
    assert "변환 불가: 날짜(end): 1" in report
    assert "변환 불가: 시군구(sigungu_code,sigungu_name): 1" in report
    assert "변환 불가: 좌표(lat,lng): 1" in report
    assert "변환 불가: 날짜(end); 좌표(lat): 1" in report
    assert "예보 수: 2" in report and "OOD 수: 2" in report
    assert "모델 버전: v0.1.0" in report and "modelVerdict: 미검증" in report


# 관측 부재·일반 오류·계약 불일치를 서로 구분하며 뒤의 정상 행을 계속 예보한다.
def test_errors_continue(
    batch_data: Path, master_row: dict, recorded_forecast: list, monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = upcoming.assemble_forecast

    # 오류 종류를 행사별로 달리 주입해 첫 오류만 남는지도 확인한다.
    def fail_some(event: dict) -> dict:
        if event["id"].endswith("0"):
            raise NoObservation()
        if event["id"].endswith("1"):
            raise RuntimeError("첫 오류\n둘째 줄")
        result = original(event)
        if event["id"].endswith("2"):
            result.pop("evidence")
        return result

    monkeypatch.setattr(upcoming, "assemble_forecast", fail_some)
    rows = [{**master_row, "event_id": f"e-jinju-2026-{i}"} for i in range(4)]
    pl.from_dicts(rows, schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    report = upcoming.run_batch()
    assert "입력 가능 수: 4" in report and "예보 수: 1" in report
    assert "503 NO_OBSERVATION: 1" in report and "그 밖의 오류 수: 2" in report
    assert "첫 오류" in report and "둘째 줄" not in report
    assert len((batch_data / "upcoming_forecasts.jsonl").read_text().splitlines()) == 1


# 입력 행 순서를 바꿔도 요약·전체 예보 바이트가 같고 중복 예보는 한 줄만 기록한다.
def test_repeatable_bytes_and_duplicates(batch_data: Path, master_row: dict, recorded_forecast: list) -> None:
    rows = [master_row, {**master_row, "event_id": "e-jinju-namgang-2027"}, master_row]
    frame = pl.from_dicts(rows, schema=EVENT_DTYPES)
    frame.write_parquet(batch_data / "events.parquet")
    report = upcoming.run_batch()
    files = [batch_data / name for name in ("upcoming.parquet", "upcoming_forecasts.jsonl")]
    before = [path.read_bytes() for path in files]
    frame.reverse().write_parquet(batch_data / "events.parquet")
    upcoming.run_batch()
    assert before == [path.read_bytes() for path in files]
    assert "중복 forecastId: 1" in report
    assert len({json.loads(line)["forecast"]["id"] for line in files[1].read_text().splitlines()}) == 2


# 90% 경계에서는 경고하지 않고 그 미만이면 QC 첫 줄 경고와 새 산출물을 남긴다.
@pytest.mark.parametrize("count,warn", [(9, False), (8, True), (0, True)])
def test_previous_count_gate(
    batch_data: Path, master_row: dict, recorded_forecast: list, count: int, warn: bool,
) -> None:
    (batch_data / "upcoming_qc.md").write_text("runId: batch-previous\n예보 수: 10\n", encoding="utf-8")
    (batch_data / "upcoming_forecasts.jsonl").write_text("stale")
    rows = [{**master_row, "event_id": f"e-jinju-2026-{i}"} for i in range(count)]
    pl.from_dicts(rows, schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    report = upcoming.run_batch()
    assert report.startswith("경고:") is warn
    run_id, previous_count = upcoming.previous_count()
    assert previous_count == count
    assert f"runId: {run_id}" in report and "직전 runId: batch-previous" in report
    frame = pl.read_parquet(batch_data / "upcoming.parquet")
    assert frame.height == count
    assert frame.schema == {**upcoming.SUMMARY_SCHEMA, **upcoming.AUDIT_SCHEMA}
    assert pl.read_parquet_metadata(batch_data / "upcoming.parquet")["runId"] == run_id
    assert len((batch_data / "upcoming_forecasts.jsonl").read_text().splitlines()) == count


# 표시용 정수는 가장 가까운 짝수로 반올림하며 원 확률은 판정 경계 직전 값도 보존한다.
def test_summary_rounding(master_row: dict, recorded_forecast: list) -> None:
    event = upcoming.contract_event(master_row)
    forecast = upcoming.assemble_forecast(event)
    forecast["peakConcurrent"].update(p10=1000.5, p50=1001.5, p90=1002.6)
    forecast["probabilities"][0]["probability"] = 0.09975
    summary = upcoming.festival_summary(event, forecast)
    assert [summary[key] for key in ("peakP10", "peakP50", "peakP90")] == [1000, 1002, 1003]
    assert summary["pOver1000"] == 0.09975


# 실행 중 모델 승격을 감지하면 이전 발행 파일을 보존하고 재실행을 요구한다.
def test_changed_pointer_keeps_previous(
    batch_data: Path, master_row: dict, recorded_forecast: list, monkeypatch: pytest.MonkeyPatch,
) -> None:
    pl.from_dicts([master_row], schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    upcoming.run_batch()
    files = [batch_data / name for name in ("upcoming.parquet", "upcoming_forecasts.jsonl", "upcoming_qc.md")]
    before = [path.read_bytes() for path in files]
    monkeypatch.setattr(upcoming, "promoted", lambda: {"modelVersion": "v0.2.0"})
    with pytest.raises(RuntimeError, match="포인터가 변경"):
        upcoming.run_batch()
    assert before == [path.read_bytes() for path in files]


# 일정 공개일은 입력 감사에만 남기고 D-14와 조기 요청의 기준일 뒤라도 예보에서 제외하지 않는다.
def test_late_schedule_is_forecast(
    batch_data: Path, master_row: dict, recorded_forecast: list, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(inputs, "today", lambda: date(2026, 9, 25))
    changes = [
        {"date_available_at": "2026-09-19"},
        {"date_available_at": "2026-09-19T15:00:00Z"},
        {"date_available_at": "2026-09-26", "start": date(2026, 10, 18)},
        {"date_available_at": None},
    ]
    rows = [{**master_row, "event_id": f"e-jinju-2026-{i}", "date_source": "TourAPI", **change}
            for i, change in enumerate(changes)]
    pl.from_dicts(rows, schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    report = upcoming.run_batch()
    assert len(recorded_forecast) == 4
    assert "일정 공개일이 asOf 뒤인 행사 2건(입력으로 사용 — 06 §3)" in report
    result = pl.read_parquet(batch_data / "upcoming.parquet").sort("eventId")
    assert result["date_source"].to_list() == ["TourAPI"] * 4
    assert result["date_available_at"].to_list() == [row["date_available_at"] for row in rows]
    for row in rows:
        assert f"{row['event_id']} | TourAPI | {row['date_available_at'] or '미상'}" in report
