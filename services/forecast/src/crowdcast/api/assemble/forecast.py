"""공개 관측·사용 모델·기존 환산 및 판정 결과를 계약 예보로 조립한다."""

from typing import Any

from crowdcast.analytics.baseline import baseline
from crowdcast.analytics.similar import related_cases
from crowdcast.api.assemble.artifacts import Unavailable
from crowdcast.api.assemble.evidence import fragment
from crowdcast.api.assemble.feature_evidence import model_evidence, observation_evidence
from crowdcast.api.assemble.history import previous_case_id
from crowdcast.api.assemble.identity import identifier
from crowdcast.api.assemble.inputs import BREAK_CODES, cutoff
from crowdcast.api.assemble.model import current_model
from crowdcast.api.assemble.observations import feature_frame, observations, prediction_run
from crowdcast.api.assemble.profile import composition
from crowdcast.data.crosswalk import CODE_CHANGE_DATE
from crowdcast.models.distribution import distribution
from crowdcast.rules.evidence import assumption_evidence
from crowdcast.rules.peak import round_people


# API의 사람 수만 정수로 복사해 원본 표본·모델 출력과 다른 단위의 수치를 보존한다.
def people_quantity(quantity: dict[str, Any]) -> dict[str, Any]:
    if quantity["unit"] not in {"명", "명/일"}:
        return dict(quantity)
    return {
        **quantity,
        **{key: round_people(quantity[key]) if quantity[key] is not None else None
           for key in ("value", "p10", "p50", "p90")},
    }


# 임시공휴일 제외는 정본에 등록된 가정만 사용한다.
def calendar_assumption() -> dict[str, Any]:
    return {
        "id": "as-temporary-holiday-excluded",
        "name": "임시공휴일 미반영",
        "value": 0,
        "low": 0,
        "high": 1,
        "unit": "일",
        "basis": "가정",
        "note": "지정 시각을 복원할 수 없어 법정·대체공휴일 규칙만 사용한다.",
    }


# 시각 대신 기준일과 입력 내용을 고정해 동일 요청은 같은 예보 바이트를 만든다.
def predict(event: dict[str, Any]) -> dict[str, Any]:
    model, pointer = current_model()
    as_of = cutoff(event)
    try:
        frame = feature_frame(event, as_of, model.encoding["features"])
    except FileNotFoundError:
        raise Unavailable("예보에 필요한 전처리 자료가 없습니다") from None
    observed = observations(frame, model.encoding["features"], event["sigunguCode"])
    quantiles, factors, ood = model.infer(frame)
    forecast_id = identifier(
        "f",
        {
            "eventId": event["id"],
            "asOf": as_of.isoformat(),
            "modelVersion": pointer["modelVersion"],
            "event": event,
        },
    )
    peak, judgment = distribution(
        quantiles,
        {**event, "startsAt": event["startsAt"].upper(), "endsAt": event["endsAt"].upper()},
        seed=model.config["seed"],
        n=model.config["samples"],
        basis=model.choice["basis"],
    )
    daily = {
        "id": identifier("q", [forecast_id, "dailyMean"]),
        "name": "일평균 방문객",
        "value": None,
        **dict(zip(("p10", "p50", "p90"), quantiles, strict=True)),
        "unit": "명/일",
        "timeUnit": "일",
        "spatialScope": "행사장",
        "valueKind": "예측",
        "estimated": False,
        "assumptionIds": [],
        "announcedAt": None,
    }

    # 시간별 분포·피크 시각은 설정에 없으므로 운영·체류 시간만으로 지어내지 않는다.
    holiday = calendar_assumption()
    result = {
        "id": forecast_id,
        "eventId": event["id"],
        "asOf": as_of.isoformat(),
        "createdAt": f"{as_of.isoformat()}T00:00:00+09:00",
        "modelVersion": pointer["modelVersion"],
        "dailyMean": people_quantity(daily),
        "peakConcurrent": people_quantity(peak.quantity(identifier("q", [forecast_id, "peakConcurrent"]))),
        "probabilities": judgment.probabilities,
        "judgment": judgment.judgment,
        "observations": observed,
        "predictionRun": prediction_run(forecast_id, as_of, model.card, pointer, observed),
        "assumptions": [*peak.assumptions, holiday],
        "peakHours": None,
        "hourlyProfile": [],
        "composition": None,
    }

    # 조회 API와 같은 근거 객체를 재사용해 세션 내 재적재 시 내용 충돌을 막는다.
    evidence, feature_ids = observation_evidence(observed)
    try:
        local = baseline(event["sigunguCode"], as_of)
    except FileNotFoundError:
        local = None
    if local:
        evidence.extend(local["evidence"])
        result["composition"], parts = composition(event["sigunguCode"], as_of, local["period"])
        evidence.extend(parts)
    previous_id = previous_case_id(event, as_of)
    for case in related_cases(event, as_of, previous_id):
        evidence.extend(case["evidence"])
    factors = [{**factor, "id": identifier("fa", [forecast_id, factor])} for factor in factors]
    explanation = model_evidence(result, model.card, model.choice["primary_model"], factors)
    result["factors"] = [
        {
            **factor,
            "evidenceIds": [feature_ids.get(factor["feature"], explanation["id"])],
        }
        for factor in factors
    ]
    evidence.extend([explanation, *peak.evidence, *judgment.evidence, assumption_evidence(holiday)])
    result["evidence"] = list({item["id"]: item for item in evidence}.values())

    # 기존 OOD 판정에 지역 연속성 단절만 더하며 개편 뒤 값을 복원하지 않는다.
    reasons = []
    if ood["training_n"] < 5:
        reasons.append("유형·규모 조합의 학습 표본 부족")
    if ood["outside_features"]:
        reasons.append("학습 범위 밖 피처: " + ", ".join(ood["outside_features"]))
    # 개편 사유는 기준일이 개편 뒤라 개편 전 자료만 쓸 수 있을 때만 붙인다(개편 전 행사는 정상 자료).
    broken = event["sigunguCode"] in BREAK_CODES and as_of >= CODE_CHANGE_DATE
    if broken:
        reasons.append("행정구역 개편 — 2026-06-30까지 자료만")
    result.update(ood=ood["ood"] or broken, oodReasons=reasons)

    # OOD 예보는 판정·권고 문장이 인용할 참고용 확인 근거를 함께 싣는다(S10 — 구조화된 검사 종류로 식별).
    if result["ood"]:
        result["evidence"].append(
            fragment(
                "check",
                "참고용 — 담당자 검토 필수",
                {"reasons": reasons},
                forecastId=result["id"],
                checkResult={"checkKind": "ood", "passed": True, "revision": 0},
            )
        )
    return result
