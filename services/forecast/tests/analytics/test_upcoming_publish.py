"""일괄 예보 실행 식별자와 세 산출물의 실패 복구를 검증한다."""

import fcntl
import json
import os
from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast.analytics import upcoming
from crowdcast.data.events import EVENT_DTYPES

FILES = ("upcoming_forecasts.jsonl", "upcoming.parquet", "upcoming_qc.md")


# 준비·교체의 어느 단계가 실패해도 이전 세 파일 또는 최초 미발행 상태를 복구한다.
@pytest.mark.parametrize("existing", [True, False])
@pytest.mark.parametrize("stage", ["write", "replace"])
@pytest.mark.parametrize("failure_at", [1, 2, 3])
def test_publish_failure_restores_all(
    batch_data: Path, master_row: dict, recorded_forecast: list, monkeypatch: pytest.MonkeyPatch,
    existing: bool, stage: str, failure_at: int,
) -> None:
    pl.from_dicts([master_row], schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    if existing:
        upcoming.run_batch()
    before = {name: (batch_data / name).read_bytes() if existing else None for name in FILES}
    pl.from_dicts([{**master_row, "name": "진주남강유등축제 특별전"}], schema=EVENT_DTYPES).write_parquet(
        batch_data / "events.parquet"
    )
    original_write, original_replace = Path.write_bytes, os.replace
    calls = 0

    # 쓰기는 임시 파일에서만 실패시켜 발행 시작 전 오류도 이전 결과를 보존하는지 본다.
    def fail_write(path: Path, content: bytes) -> int:
        nonlocal calls
        if path.parent.name.startswith(".upcoming-") and path.name in FILES:
            calls += 1
            if calls == failure_at:
                raise OSError("임시 파일 쓰기 실패")
        return original_write(path, content)

    # 첫 교체 전에 모든 새 파일이 완성됐는지 확인하고 원하는 교체에서 한 번 실패시킨다.
    def fail_replace(source: Path, target: Path) -> None:
        nonlocal calls
        calls += 1
        if calls == 1:
            assert all((source.parent / name).is_file() for name in FILES)
            assert all((batch_data / name).read_bytes() == before[name] for name in FILES if existing)
        if calls == failure_at:
            raise OSError("파일 교체 실패")
        original_replace(source, target)

    monkeypatch.setattr(Path, "write_bytes", fail_write if stage == "write" else original_write)
    monkeypatch.setattr(os, "replace", fail_replace if stage == "replace" else original_replace)
    with pytest.raises(OSError, match="실패"):
        upcoming.run_batch()
    assert before == {name: (batch_data / name).read_bytes() if (batch_data / name).exists() else None
                      for name in FILES}
    assert not list(batch_data.glob(".upcoming-*"))
    # 실패 경로에서도 파일 핸들이 닫혀 다음 실행이 잠금을 얻을 수 있어야 한다.
    with (batch_data / ".upcoming.lock").open("w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)


# 이미 실행 중이면 QC·입력을 읽기 전 거부하고 직전 세 산출물을 그대로 보존한다.
def test_locked_batch_keeps_previous(
    batch_data: Path, master_row: dict, recorded_forecast: list, monkeypatch: pytest.MonkeyPatch,
) -> None:
    pl.from_dicts([master_row], schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    upcoming.run_batch()
    before = {name: (batch_data / name).read_bytes() for name in FILES}
    calls = len(recorded_forecast)

    # 잠금 확인보다 QC 조회가 먼저 실행되면 즉시 실패시킨다.
    def reject_read() -> None:
        pytest.fail("잠긴 실행이 직전 QC를 읽었습니다")

    monkeypatch.setattr(upcoming, "previous_count", reject_read)
    with (batch_data / ".upcoming.lock").open("w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with pytest.raises(RuntimeError, match="다른 일괄 예보 실행 중"):
            upcoming.run_batch()
    assert before == {name: (batch_data / name).read_bytes() for name in FILES}
    assert len(recorded_forecast) == calls
    assert not list(batch_data.glob(".upcoming-*"))


# QC 조회부터 조립과 최종 발행까지 잠금을 유지하고 정상 종료 뒤에는 해제한다.
@pytest.mark.parametrize("stage", ["previous_count", "assemble_forecast", "publish"])
def test_batch_holds_lock_through_publication(
    batch_data: Path, master_row: dict, recorded_forecast: list, monkeypatch: pytest.MonkeyPatch,
    stage: str,
) -> None:
    pl.from_dicts([master_row], schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    original = getattr(upcoming, stage)
    checked = []

    # 별도 파일 핸들로 실제 배타 잠금 충돌을 확인한 뒤 원래 단계를 실행한다.
    def check_lock(*args: object) -> object:
        with (batch_data / ".upcoming.lock").open("w") as handle:
            with pytest.raises(BlockingIOError):
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        checked.append(stage)
        return original(*args)

    monkeypatch.setattr(upcoming, stage, check_lock)
    upcoming.run_batch()
    assert checked == [stage]
    with (batch_data / ".upcoming.lock").open("w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)


# 정상 교체의 세 산출물이 같은 실행을 가리키며 다음 실행의 경고 기준에도 그 식별자가 남는다.
def test_run_id_and_previous_qc(batch_data: Path, master_row: dict, recorded_forecast: list) -> None:
    pl.from_dicts([master_row], schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    assert upcoming.previous_count() is None
    report = upcoming.run_batch()
    records = [json.loads(line) for line in (batch_data / FILES[0]).read_text().splitlines()]
    table = pl.read_parquet(batch_data / FILES[1])
    run_id = table["runId"][0]
    assert {record["runId"] for record in records} == {run_id}
    assert f"runId: {run_id}" in report.split("## ")[0]
    assert "중단 시 세 파일 runId가 다를 수 있음 — 읽는 쪽이 거부" in report.split("## ")[0]
    assert upcoming.previous_count() == (run_id, 1)
    assert f"직전 runId: {run_id}" in upcoming.run_batch()
    (batch_data / FILES[2]).write_text("예보 수: 1\n", encoding="utf-8")
    assert upcoming.previous_count() == (None, 1)
    assert "직전 runId: 미기록(구형 QC)" in upcoming.run_batch()


# 입력·관측·기간·기준일·모델 중 하나가 바뀌면 다른 runId가 된다.
@pytest.mark.parametrize("change", [
    "event", "labels", "region_daily", "window", "modelVersion", "runId", "verdict", "as_of",
])
def test_run_id_tracks_inputs(
    batch_data: Path, master_row: dict, monkeypatch: pytest.MonkeyPatch, change: str,
) -> None:
    frame = pl.from_dicts([master_row], schema=EVENT_DTYPES)
    start, end = upcoming.WINDOW_START, upcoming.WINDOW_END
    pointer = upcoming.promoted()
    before = upcoming.run_identifier(frame, start, end, pointer)
    if change == "event":
        frame = frame.with_columns(pl.lit("2026-09-25").alias("date_available_at"))
    elif change in {"labels", "region_daily"}:
        pl.DataFrame({"visitors": [123]}).write_parquet(batch_data / f"{change}.parquet")
    elif change == "window":
        start = date(2026, 10, 1)
    elif change in {"modelVersion", "runId", "verdict"}:
        values = {"modelVersion": "v0.2.0", "runId": "bt-v0.2.0", "verdict": "통과"}
        pointer = {**pointer, change: values[change]}
    else:
        monkeypatch.setattr(upcoming, "cutoff", lambda event: date(2026, 9, 1))
    assert upcoming.run_identifier(frame, start, end, pointer) != before


# 같은 모델을 다시 승격해 시각만 달라져도 실행 식별자와 예보 산출물 바이트를 유지한다.
def test_promoted_at_does_not_change_run_id_or_forecasts(
    batch_data: Path, master_row: dict, recorded_forecast: list,
) -> None:
    frame = pl.from_dicts([master_row], schema=EVENT_DTYPES)
    frame.write_parquet(batch_data / "events.parquet")
    pointer = upcoming.promoted()
    pointer["promotedAt"] = "2026-09-25T09:00:00+09:00"
    run_id = upcoming.run_identifier(frame, upcoming.WINDOW_START, upcoming.WINDOW_END, pointer)
    upcoming.run_batch()
    before = {name: (batch_data / name).read_bytes() for name in FILES[:2]}
    pointer["promotedAt"] = "2026-09-25T10:00:00+09:00"
    assert upcoming.run_identifier(frame, upcoming.WINDOW_START, upcoming.WINDOW_END, pointer) == run_id
    report = upcoming.run_batch()
    assert f"runId: {run_id}" in report
    assert before == {name: (batch_data / name).read_bytes() for name in FILES[:2]}


# 실행 도중 관측 자료가 바뀌면 일관된 입력 해시를 붙일 수 없어 기존 발행본을 보존한다.
def test_changed_inputs_keep_previous(
    batch_data: Path, master_row: dict, recorded_forecast: list, monkeypatch: pytest.MonkeyPatch,
) -> None:
    pl.from_dicts([master_row], schema=EVENT_DTYPES).write_parquet(batch_data / "events.parquet")
    upcoming.run_batch()
    before = [(batch_data / name).read_bytes() for name in FILES]
    original = upcoming.assemble_forecast

    # 조립 뒤 원본 갱신을 흉내 내어 발행 직전 재검사의 동작을 확인한다.
    def change_inputs(event: dict) -> dict:
        result = original(event)
        pl.DataFrame({"visitors": [123]}).write_parquet(batch_data / "region_daily.parquet")
        return result

    monkeypatch.setattr(upcoming, "assemble_forecast", change_inputs)
    with pytest.raises(RuntimeError, match="입력이 변경"):
        upcoming.run_batch()
    assert before == [(batch_data / name).read_bytes() for name in FILES]
