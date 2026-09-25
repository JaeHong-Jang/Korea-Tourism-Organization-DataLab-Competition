"""행사 정보·날씨·판정 등급에서 점검 항목과 켜진 이유의 근거를 만든다."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from crowdcast.rules.evidence import rule_evidence, rule_settings


# 항목의 근거 참조를 응답 근거 목록과 함께 전달한다.
@dataclass(frozen=True)
class ChecklistResult:
    checklist: list[dict[str, Any]]
    evidence: list[dict[str, Any]]


# 계약 필드 이름을 유지하며 실제로 맞은 조건과 입력값을 기록한다.
def _matched_conditions(
    conditions: Mapping[str, Any],
    event: Mapping[str, Any],
    weather: Mapping[str, Any] | None,
    level: int | None,
) -> dict[str, Any]:
    # 출처만 있고 강수 정보가 모두 없으면 알려진 건조한 날씨로 취급하지 않는다.
    matched: dict[str, Any] = {}
    if weather is not None and {"pop", "pty"} <= conditions.keys():
        if weather["pop"] is None and weather["pty"] is None:
            matched.update(pop=None, pty=None, source=weather["source"])

    # 행사 조건과 유효 시각을 각각 검사하고 맞은 입력은 근거에 그대로 남긴다.
    for field, expected in conditions.items():
        if field == "level_min":
            if level is not None and level >= expected:
                matched["level"] = level
        elif field == "hazards":
            hazards = sorted(set(event["hazards"]) & set(expected))
            if hazards:
                matched[field] = hazards
        elif field in {"timeOfDay", "type"}:
            if event[field] in expected:
                matched[field] = event[field]
        elif field in {"pop", "pty", "source"}:
            value = weather[field] if weather is not None else "없음" if field == "source" else None
            if field == "pop":
                if value is not None and value >= expected:
                    matched[field] = value
            elif value in expected:
                matched[field] = value
        elif field == "at":
            if weather is not None and weather["source"] != "없음":
                starts_at = datetime.fromisoformat(event["startsAt"])
                at = datetime.fromisoformat(weather["at"])
                valid_for = timedelta(days=expected[weather["source"]])
                if not timedelta(0) <= starts_at - at <= valid_for:
                    matched.update(at=weather["at"], startsAt=event["startsAt"], source=weather["source"])
        else:
            raise ValueError(f"체크리스트에 지원하지 않는 조건 필드가 있습니다: {field}")
    return matched


# 등급 조건은 판정에서 받은 값으로만 검사하고 기존 행사·날씨 점검은 그대로 유지한다.
def build(
    event: Mapping[str, Any], weather: Mapping[str, Any] | None = None, *, level: int | None = None
) -> ChecklistResult:
    checklist, evidence = [], []
    for rule_id, rule in rule_settings()["rules"].items():
        if "conditions" not in rule:
            continue
        matched = _matched_conditions(rule["conditions"], event, weather, level)
        if not matched:
            continue

        # 조건과 실제 필드를 함께 해시에 넣어 설정 또는 입력 변경을 구분한다.
        fragment = rule_evidence(
            rule_id,
            {"eventId": event["id"], "conditions": rule["conditions"], "matched": matched},
        )
        checklist.append(
            {"id": rule["id"], "text": rule["text"], "ruleId": rule_id, "evidenceIds": [fragment["id"]]}
        )
        evidence.append(fragment)
    return ChecklistResult(checklist, evidence)
