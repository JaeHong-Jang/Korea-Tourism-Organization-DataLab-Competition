"""조건별 제외·층화 보충·순서 결정성과 T-205 실행 묶음 검증을 확인한다."""

import json
from copy import deepcopy
from datetime import date

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.scoring import rules
from crowdcast.scoring.select import Batch, load_batch, load_selection, select_festivals, selection_key
from scoring_fixtures import inputs, model_metadata, write_batch


# 입력 순서를 섞어도 등급순·해시순 8건씩이 같은 순서로 나온다.
def test_stratification_and_determinism() -> None:
    batch, events, region = inputs([1, 2, 3, 4] * 10)
    first = select_festivals(batch, events, region)
    shuffled = Batch(list(reversed(batch.summaries)), batch.forecasts, batch.metadata)
    assert first == select_festivals(shuffled, list(reversed(events)), region.reverse())
    assert first["audit"]["levelCounts"] == {str(level): 8 for level in rules.LEVELS}
    expected = [r["eventId"] for level in rules.LEVELS
                for r in sorted((r for r in batch.summaries if r["level"] == level), key=selection_key)[:8]]
    assert [r["eventId"] for r in first["summaries"]] == expected


# 한 등급만 있어도 우선 8건 뒤 같은 전체 해시순으로 20건까지 채운다.
def test_fill_and_shortfall() -> None:
    batch, events, region = inputs([4] * 25)
    result = select_festivals(batch, events, region)
    assert result["audit"]["stratified"] == 8 and result["audit"]["filled"] == 12
    assert result["audit"]["levelCounts"] == {"1": 0, "2": 0, "3": 0, "4": 20}
    assert [r["eventId"] for r in result["summaries"]] == [
        r["eventId"] for r in sorted(batch.summaries, key=selection_key)[:20]]
    small, events, region = inputs([1, 3])
    assert "미달" in select_festivals(small, events, region)["audit"]["shortfallReason"]


# 첫 제외 사유만 세며 등록일 뒤 일정은 D-14와 별도로 검사한다.
@pytest.mark.parametrize(("field", "value", "reason"), [
    ("startsAt", "2026-10-01T00:00:00+09:00", "리드타임"),
    ("endsAt", "2026-11-01T00:00:00+09:00", "종료일"),
    ("sigunguCode", "28110", "연속성"),
    ("sigunguCode", "28155", "연속성"),
    ("date_available_at", "2026-09-29T16:00:00Z", "등록일 뒤"),
    ("endsAt", "2026-10-23T00:00:00+09:00", "기간 범위"),
])
def test_exclusions(field: str, value: str, reason: str) -> None:
    batch, events, region = inputs([4])
    batch.summaries[0][field] = value
    result = select_festivals(batch, events, region)
    assert not result["summaries"]
    assert reason in result["audit"]["excluded"][0]["reason"]


# 시군구 모호·연속성 단절을 각각 별도 기록한다.
@pytest.mark.parametrize(("changes", "reason"), [
    ({"sigungu_match": "ambiguous"}, "시군구 미확정"),
    ({"continuity_break": True}, "연속성 끊김"),
])
def test_master_exclusions(changes: dict, reason: str) -> None:
    batch, events, region = inputs([4])
    events[0].update(changes)
    result = select_festivals(batch, events, region)
    assert reason in result["audit"]["excluded"][0]["reason"]


# 마스터의 비정본 상태 필드나 채점 상태 파일은 기계적 선정에 영향을 주지 않는다.
@pytest.mark.parametrize("status", ["취소", "연기"])
def test_cancellation_does_not_change_selection(status: str) -> None:
    batch, events, region = inputs([4])
    expected = select_festivals(batch, events, region)
    events[0].update(status=status, cancelled=True, postponed=True)
    paths.PROCESSED.mkdir(parents=True)
    (paths.PROCESSED / "prereg_status.json").write_text("invalid", encoding="utf-8")
    assert select_festivals(batch, events, region) == expected


# 미래 관측·세 구분 누락을 표본 수로 인정하지 않고 공개일 미상은 고지한다.
def test_baseline_samples_and_date_disclosure() -> None:
    batch, events, region = inputs([4])
    result = select_festivals(batch, events, region)
    assert result["audit"]["notes"] == {rules.UNPROVEN_DATE: 1}
    batch.summaries[0]["date_available_at"] = "2026-09-29T14:59:59Z"
    assert select_festivals(batch, events, region)["audit"]["selected"] == 1
    missing = region.filter(~((pl.col("date") == date(2026, 8, 7)) & (pl.col("tou_div") == "외국인")))
    assert select_festivals(batch, events, missing)["audit"]["selected"] == 0
    late = region.with_columns(pl.lit(date(2026, 9, 30)).alias("available_at"))
    assert select_festivals(batch, events, late)["audit"]["selected"] == 0


# 표본이 남아 있어도 공개 평시 창의 연속성 단절 하루를 건너뛰어 채택하지 않는다.
def test_baseline_continuity_break() -> None:
    batch, events, region = inputs([4])
    broken = region.with_columns((pl.col("date") == date(2026, 8, 3)).alias("continuity_break"))
    result = select_festivals(batch, events, broken)
    assert result["audit"]["excludedCounts"] == {"연속성 끊김(인천 개편 포함)": 1}


# 요약에 없는 위험·시간대 변경도 미선정 후보와 제외 후보까지 예보 ID로 검출한다.
@pytest.mark.parametrize(("field", "value"), [("hazard_flags", ["불꽃"]), ("time_of_day", "야간")])
@pytest.mark.parametrize("excluded", [False, True])
def test_master_snapshot_must_match_batch(monkeypatch: pytest.MonkeyPatch, field: str,
                                         value: list[str] | str, excluded: bool) -> None:
    batch, events, region = inputs([4] * 21)
    last = max(batch.summaries, key=selection_key)["eventId"]
    master = next(event for event in events if event["event_id"] == last)
    master["continuity_break"] = excluded
    write_batch(paths.PROCESSED, batch, events, region)
    monkeypatch.setattr(rules, "model_metadata", model_metadata)
    _, selection = load_selection()
    assert selection["audit"]["selected"] == 20
    assert last not in selection["events"]
    assert selection["audit"]["eligible"] == 21 - excluded

    # 예보·요약은 그대로 둔 채 마스터 한 필드만 변경해 전체 선정을 거부하게 한다.
    master[field] = value
    write_batch(paths.PROCESSED, batch, events, region)
    with pytest.raises(ValueError, match="T-205 뒤 행사 마스터가 바뀜 — 일괄 예보를 다시 돌리세요"):
        load_selection()


# 같은 runId라도 빈 파일·중복·누락·다른 ID의 예보는 선정이나 등록에 쓸 수 없다.
@pytest.mark.parametrize("fault", ["run", "empty", "missing", "duplicate", "id", "fraction", "model", "asof"])
def test_batch_rejects_mixed_or_incomplete_files(monkeypatch: pytest.MonkeyPatch, fault: str) -> None:
    batch, events, region = inputs([1, 2])
    write_batch(paths.PROCESSED, batch, events, region)
    monkeypatch.setattr(rules, "model_metadata", model_metadata)
    assert len(load_batch().summaries) == 2
    file = paths.PROCESSED / "upcoming_forecasts.jsonl"
    rows = [json.loads(line) for line in file.read_text().splitlines()]
    if fault == "run":
        rows[0]["runId"] = "batch-other"
    elif fault == "empty":
        rows = []
    elif fault == "missing":
        rows.pop()
    elif fault == "duplicate":
        rows[1] = deepcopy(rows[0])
    elif fault == "id":
        rows[0]["forecast"]["id"] = "f-other"
    elif fault == "fraction":
        rows[0]["forecast"]["dailyMean"]["p10"] = 1.25
    elif fault == "model":
        rows[0]["forecast"]["modelVersion"] = "v-old"
    else:
        rows[0]["forecast"]["asOf"] = "2026-10-01"
    file.write_text("".join(json.dumps(row) + "\n" for row in rows))
    with pytest.raises(ValueError):
        load_batch()


# 두 산출물이 모두 빈 경우에도 parquet 메타를 보존해 정상 빈 실행으로 읽는다.
def test_empty_pair(monkeypatch: pytest.MonkeyPatch) -> None:
    batch, events, region = inputs([])
    write_batch(paths.PROCESSED, batch, events, region)
    monkeypatch.setattr(rules, "model_metadata", model_metadata)
    assert load_batch().summaries == []
