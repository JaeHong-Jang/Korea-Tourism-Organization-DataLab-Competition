"""공개된 대표 라벨만 단위와 함께 돌려주고 유형·규모·지역으로 유사 사례를 정렬한다."""

import math
from datetime import date
from typing import Any

from crowdcast.api.assemble.evidence import fragment, source
from crowdcast.api.assemble.history import previous_case_id
from crowdcast.api.assemble.identity import identifier
from crowdcast.api.assemble.inputs import cutoff, feature_event, primary_labels
from crowdcast.api.contract import _validators, validate
from crowdcast.features.availability import publication_date
from crowdcast.features.history_features import GOLD_TIERS, festival_key
from crowdcast.models.baselines import size_band


# 단위 정의가 같은 일평균이나 공개된 직전 실측만 검색 규모로 쓴다.
def reference_size(
    event: dict[str, Any], as_of: date, events: dict[str, dict[str, Any]], labels: list[dict[str, Any]]
) -> float | None:
    expected = event.get("expectedByHost")
    if expected and (
        expected["unit"] == "명/일"
        and expected["timeUnit"] == "일"
        and expected["spatialScope"] == "행사장"
        and expected["valueKind"] == "사전예상"
        and expected["value"] is not None
        and expected["announcedAt"]
        and publication_date(expected["announcedAt"]) <= as_of
    ):
        return float(expected["value"])
    key = festival_key(feature_event(event))
    prior = [
        row
        for row in labels
        if festival_key(events[row["event_id"]]) == key
        and row["label_tier"] in GOLD_TIERS
        and row["spatial_scope"] == "행사장"
    ]
    if not prior:
        return None
    return float(max(prior, key=lambda row: (events[row["event_id"]]["end"], row["event_id"]))["daily_mean"])


# 발표 메타데이터가 없는 문체부 정수는 일평균 또는 누적으로 추측하지 않는다.
def announced_quantity(event: dict[str, Any], as_of: date) -> dict[str, Any] | None:
    value = event.get("announced")
    if value is None:
        return None
    _validators()["common"].evolve(
        schema={
            "$ref": "https://crowdcast.local/schemas/common.schema.json#/$defs/quantity",
        }
    ).validate(value)
    day = publication_date(value.get("announcedAt"))
    if day is None or day > as_of:
        return None
    return dict(value)


# 원본 라벨의 공간·시간 범위를 그대로 보존하며 정의 밖 단위는 계약 검증에서 실패시킨다.
def case(
    event: dict[str, Any], label: dict[str, Any], comparisons: dict[str, bool | None], as_of: date
) -> dict[str, Any]:
    value = float(label["daily_mean"])
    if not math.isfinite(value) or value < 0:
        raise ValueError("유사 사례 방문자 수 오류")
    measured = {
        "name": "일평균 방문객(시군구 순증 추정)"
        if label["label_tier"] == "silver"
        else "일평균 방문객(실측)",
        "value": value,
        "p10": None,
        "p50": None,
        "p90": None,
        "unit": "명/일",
        "timeUnit": label["time_unit"],
        "spatialScope": label["spatial_scope"],
        "valueKind": label["kind"].replace(" ", ""),
        "estimated": label["label_tier"] == "silver",
        "assumptionIds": [],
        "announcedAt": label["available_at"].isoformat(),
    }
    measured = {"id": identifier("q", {"eventId": event["event_id"], **measured}), **measured}
    announced = announced_quantity(event, as_of)
    unit_fields = ("unit", "timeUnit", "spatialScope", "valueKind")
    comparable = bool(announced and all(measured[key] == announced[key] for key in unit_fields))
    quantities = [measured]
    known = [value for value in comparisons.values() if value is not None]
    score = sum(known) / len(known)
    comparison_text = "·".join(
        f"{name} {'확인 불가' if value is None else '같음' if value else '다름'}"
        for name, value in comparisons.items()
    )
    evidence = fragment(
        "case",
        f"{event['year']} {event['name']}",
        {
            "eventId": event["event_id"],
            "year": event["year"],
            "quantities": quantities,
            "definition": label["definition"],
            "method": label["method"],
            "sourceFile": label["source_file"],
            "sourceRow": label["source_row"],
            "similarity": score,
            "comparison": f"유사도 {score} — {comparison_text}",
        },
        quantityIds=[item["id"] for item in quantities],
        period={"from": event["start"].isoformat(), "to": event["end"].isoformat()},
        source=source(label["label_tier"]),
        availableAt=label["available_at"].isoformat(),
        caseEventId=event["event_id"],
    )
    fragments = [evidence]
    if announced:
        fragments.append(
            fragment(
                "case",
                f"{event['year']} {event['name']} 발표 인원",
                announced,
                quantityIds=[announced["id"]],
                period=evidence["period"],
                source=source("announced"),
                availableAt=announced["announcedAt"],
                caseEventId=event["event_id"],
            )
        )
    result = {
        "eventId": event["event_id"],
        "name": event["name"],
        "year": event["year"],
        "sigunguName": event["sigungu_name"],
        "type": event["type"],
        "measured": measured,
        "announced": announced,
        "unitsComparable": comparable,
        "similarity": score,
        "evidenceId": evidence["id"],
        "evidence": fragments,
    }
    validate("similar-event", result)
    return result


# 유사 사례 다섯 건과 실제 예측에 쓰인 전회차를 같은 비교·근거 생성 경로로 조립한다.
def related_cases(event: dict[str, Any], as_of: date, previous_id: str | None = None) -> list[dict[str, Any]]:
    events, labels = primary_labels(as_of)
    index = {row["event_id"]: row for row in events}
    candidates = [
        row
        for row in labels
        if row["event_id"] != event["id"]
        and row["usable_for_training"]
        and index[row["event_id"]].get("start")
        and index[row["event_id"]].get("sigungu_name")
        and index[row["event_id"]].get("type")
    ]
    size = reference_size(event, as_of, index, candidates)
    scored = []
    for label in candidates:
        prior = index[label["event_id"]]
        comparisons = {
            "유형": prior["type"] == event["type"],
            # 실버(시군구 순증)는 행사장 방문객과 정의가 달라 규모대를 비교하지 않는다(확인 불가).
            "규모대": None
            if size is None or label.get("spatial_scope") != "행사장"
            else size_band(label["daily_mean"]) == size_band(size),
            "지역": prior["sigungu_code"] == event["sigunguCode"],
        }
        known = [value for value in comparisons.values() if value is not None]
        score = sum(known) / len(known)
        scored.append((score, prior["event_id"], prior, label, comparisons))

    # 동점은 행사 식별자로 고정하고, 전회차가 상위 다섯 건 밖이면 상위 네 건 + 전회차로 다섯 건을 지킨다.
    ranked = sorted(scored, key=lambda item: (-item[0], item[1]))
    chosen = ranked[:5]
    if previous_id and previous_id not in {item[1] for item in chosen}:
        chosen = ranked[:4] + [item for item in ranked if item[1] == previous_id]
    return [case(prior, label, comparisons, as_of) for _, _, prior, label, comparisons in chosen]


# 조회 API와 예보 조립은 같은 전회차·같은 선택 규칙을 써서 예보의 사례 근거가 조회 결과 안에 있게 한다.
def similar(event: dict[str, Any], *, as_of: date | None = None) -> list[dict[str, Any]]:
    as_of = as_of or cutoff(event)
    return related_cases(event, as_of, previous_case_id(event, as_of))
