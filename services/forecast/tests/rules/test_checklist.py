"""규모 외 위험 조건의 분기·우천 대비·등록 규칙과 근거 연결을 검증한다."""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from crowdcast.api.contract import validate
from crowdcast.rules.checklist import build
from crowdcast.rules.evidence import rule_settings
from crowdcast.rules.judge import judge


# 각 행사 조건을 단독으로 켰을 때 표에 지정된 점검만 생성한다.
@pytest.mark.parametrize(
    ("changes", "rule_id", "text"),
    [
        ({"hazards": ["차량진입"]}, "rule-check-vehicle", "차량 진입·보행 동선 분리"),
        ({"hazards": ["수면"]}, "rule-check-water-slope", "수변·경사 구역 안전"),
        ({"hazards": ["산"]}, "rule-check-water-slope", "수변·경사 구역 안전"),
        ({"timeOfDay": "야간"}, "rule-check-night-lighting", "야간 조명"),
        ({"hazards": ["야간조명부족"]}, "rule-check-night-lighting", "야간 조명"),
        ({"hazards": ["불"]}, "rule-check-fire", "화기 관리"),
        ({"hazards": ["폭죽"]}, "rule-check-fire", "화기 관리"),
        ({"hazards": ["가연성가스"]}, "rule-check-fire", "화기 관리"),
        ({"hazards": ["석유류"]}, "rule-check-fire", "화기 관리"),
        ({"hazards": ["단일출입구"]}, "rule-check-single-exit", "단일 출입구"),
        ({"hazards": ["무대밀집"]}, "rule-check-stage-crowd", "무대 앞 밀집"),
        ({"type": "공연"}, "rule-check-stage-crowd", "무대 앞 밀집"),
    ],
)
def test_event_conditions(
    daytime_event: dict[str, Any],
    dry_weather: dict[str, Any],
    changes: dict[str, Any],
    rule_id: str,
    text: str,
) -> None:
    result = build({**daytime_event, **changes}, dry_weather)
    assert len(result.checklist) == len(result.evidence) == 1
    assert result.checklist[0]["ruleId"] == rule_id
    assert result.checklist[0]["text"] == text
    assert result.checklist[0]["evidenceIds"] == [result.evidence[0]["id"]]
    assert all(field in result.evidence[0]["summary"] for field in changes)


# 강수확률 경계·모든 강수 형태·날씨 미확보를 서로 독립적으로 확인한다.
@pytest.mark.parametrize(
    ("changes", "enabled"),
    [
        ({"pop": 29}, False),
        ({"pop": 30}, True),
        ({"pop": 100}, True),
        ({"pop": None}, False),
        ({"pty": None}, False),
        ({"pty": "비"}, True),
        ({"pty": "비/눈"}, True),
        ({"pty": "눈"}, True),
        ({"pty": "소나기"}, True),
        ({"source": "초단기실황", "pop": None, "pty": None}, True),
        ({"source": "단기예보", "pop": None, "pty": None}, True),
        ({"source": "중기예보", "pop": None, "pty": None}, True),
        ({"source": "없음", "pop": None, "pty": None}, True),
        ({"source": "없음", "pop": 0, "pty": "없음"}, True),
        (None, True),
    ],
)
def test_weather_conditions(
    daytime_event: dict[str, Any],
    dry_weather: dict[str, Any],
    changes: dict[str, Any] | None,
    enabled: bool,
) -> None:
    weather = None if changes is None else {**dry_weather, **changes}
    if weather is not None:
        validate("weather", weather)
    result = build(daytime_event, weather)
    assert [item["ruleId"] for item in result.checklist] == (["rule-check-rain-shelter"] if enabled else [])
    assert len(result.evidence) == int(enabled)
    if enabled:
        assert result.checklist[0]["text"] == "우천 시 대피 공간"
        validate("evidence", result.evidence[0])


# 유효 범위 양끝과 바로 바깥을 검사하고 수집 시각 대신 날씨 시각을 사용한다.
@pytest.mark.parametrize(
    ("source", "seconds_before", "enabled"),
    [
        ("단기예보", -1, True),
        ("단기예보", 0, False),
        ("단기예보", 3 * 86400 - 1, False),
        ("단기예보", 3 * 86400, False),
        ("단기예보", 3 * 86400 + 1, True),
        ("단기예보", 10 * 86400, True),
        ("중기예보", -1, True),
        ("중기예보", 0, False),
        ("중기예보", 10 * 86400 - 1, False),
        ("중기예보", 10 * 86400, False),
        ("중기예보", 10 * 86400 + 1, True),
        ("초단기실황", 0, False),
        ("초단기실황", 1, True),
    ],
)
def test_weather_validity_window(
    daytime_event: dict[str, Any],
    dry_weather: dict[str, Any],
    source: str,
    seconds_before: int,
    enabled: bool,
) -> None:
    at = datetime.fromisoformat(daytime_event["startsAt"]) - timedelta(seconds=seconds_before)
    weather = {**dry_weather, "at": at.isoformat(), "source": source}
    validate("weather", weather)
    result = judge([0], daytime_event, weather)
    validate("judgment", result.judgment)
    assert result.judgment["level"] == 1
    checks = result.judgment["checklist"]
    assert [item["ruleId"] for item in checks] == (["rule-check-rain-shelter"] if enabled else [])
    if enabled:
        fragment = next(item for item in result.evidence if item["id"] == checks[0]["evidenceIds"][0])
        validate("evidence", fragment)
        assert fragment["ruleId"] == "rule-check-rain-shelter"
        assert all(
            value in fragment["summary"] for value in [weather["at"], daytime_event["startsAt"], source]
        )


# 같은 순간의 UTC와 KST 표현은 유효 범위의 안팎 판정을 바꾸지 않는다.
@pytest.mark.parametrize("seconds_before", [0, 3 * 86400, 3 * 86400 + 1])
def test_weather_validity_respects_timezones(
    daytime_event: dict[str, Any], dry_weather: dict[str, Any], seconds_before: int
) -> None:
    at = datetime.fromisoformat(daytime_event["startsAt"]) - timedelta(seconds=seconds_before)
    korea = build(daytime_event, {**dry_weather, "at": at.isoformat()})
    utc = build(daytime_event, {**dry_weather, "at": at.astimezone(UTC).isoformat()})
    assert bool(korea.checklist) == bool(utc.checklist) == (seconds_before > 3 * 86400)


# 모르는 강수값과 기한 초과의 실제 입력을 근거에 남기고 입력 변경을 식별한다.
def test_unknown_weather_evidence_tracks_inputs(
    daytime_event: dict[str, Any], dry_weather: dict[str, Any]
) -> None:
    missing = {**dry_weather, "source": "중기예보", "pop": None, "pty": None}
    first = build(daytime_event, missing)
    assert first == build(daytime_event, missing)
    assert '"pop":null' in first.evidence[0]["summary"]
    assert '"pty":null' in first.evidence[0]["summary"]
    assert "중기예보" in first.evidence[0]["summary"]

    # 같은 행사라도 적용 범위를 벗어난 날씨 시각이 다르면 근거 해시가 달라진다.
    old = build(daytime_event, {**dry_weather, "at": "2025-10-01T19:00:00+09:00"})
    older = build(daytime_event, {**dry_weather, "at": "2025-09-30T19:00:00+09:00"})
    assert len({first.evidence[0]["id"], old.evidence[0]["id"], older.evidence[0]["id"]}) == 3


# 여러 조건이 동시에 맞아도 항목은 하나이며 규칙과 근거는 모두 정본·계약에 맞는다.
def test_all_checks_have_registered_evidence(
    daytime_event: dict[str, Any], master_ids: dict[str, Any]
) -> None:
    daytime_event.update(
        type="공연",
        timeOfDay="야간",
        hazards=["차량진입", "수면", "산", "야간조명부족", "불", "폭죽", "단일출입구", "무대밀집"],
    )
    result = build(daytime_event)
    expected = {
        rule_id
        for rule_id in master_ids["rules"]
        if rule_id.startswith("rule-check-")
        and "level_min" not in rule_settings()["rules"][rule_id]["conditions"]
    }
    assert len(result.checklist) == len(result.evidence) == len(expected) == 7
    assert {item["ruleId"] for item in result.checklist} == expected
    assert len({item["id"] for item in result.checklist}) == 7
    fragments = {item["id"]: item for item in result.evidence}
    for item in result.checklist:
        fragment = fragments[item["evidenceIds"][0]]
        validate("evidence", fragment)
        assert fragment["ruleId"] == item["ruleId"]
        assert fragment["clauseId"] is fragment["checkResult"] is None
        assert rule_settings()["rules"][item["ruleId"]]["kind"] == "자체"


# 위험 요소 순서는 근거를 바꾸지 않지만 우천 판단 입력이 바뀌면 새 근거가 된다.
def test_evidence_is_reproducible_and_tracks_trigger(
    daytime_event: dict[str, Any], dry_weather: dict[str, Any]
) -> None:
    first = build({**daytime_event, "hazards": ["불", "폭죽"]}, {**dry_weather, "pop": 30})
    same = build({**daytime_event, "hazards": ["폭죽", "불"]}, {**dry_weather, "pop": 30})
    changed = build({**daytime_event, "hazards": ["불", "폭죽"]}, {**dry_weather, "pop": 31})
    assert first == same
    assert first.evidence[0] == changed.evidence[0]
    assert first.evidence[-1]["id"] != changed.evidence[-1]["id"]


# 알려진 건조한 날씨와 해당 위험이 없으면 빈 체크리스트도 정상 결과다.
def test_no_matching_conditions(daytime_event: dict[str, Any], dry_weather: dict[str, Any]) -> None:
    result = build(daytime_event, dry_weather)
    assert result.checklist == result.evidence == []
