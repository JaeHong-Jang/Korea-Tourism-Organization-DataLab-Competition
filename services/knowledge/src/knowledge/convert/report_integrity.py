"""발행 예보서 스냅샷의 카드 투영과 근거 묶음을 검사한다."""

from knowledge.convert.documents import same_content


# 근거 목록에서 id 집합을 만든다.
def ids(items: list[dict]) -> set[str]:
    return {item["id"] for item in items}


# 숫자를 계산하지 않고 계약의 projectCard와 같은 필드를 투영한다.
def project_card(forecast: dict) -> dict:
    keys = (
        "id",
        "eventId",
        "asOf",
        "modelVersion",
        "dailyMean",
        "peakConcurrent",
        "probabilities",
        "peakHours",
        "ood",
        "oodReasons",
    )
    judgment = forecast["judgment"]
    return {
        **{key: forecast[key] for key in keys},
        "judgment": {
            "level": judgment["level"],
            "label": judgment["label"],
            "reasons": [
                {key: reason[key] for key in ("ruleId", "kind", "text")} for reason in judgment["reasons"]
            ],
        },
    }


# 예보서의 머리와 카드·문장·근거가 같은 예보 스냅샷인지 확인한다.
def report_problems(doc: dict) -> list[str]:
    out = []
    forecast = doc["forecast"]
    if forecast["id"] != doc["forecastId"]:
        out.append(f"forecast.id {forecast['id']} ≠ forecastId {doc['forecastId']}")
    if forecast["eventId"] != doc["event"]["id"]:
        out.append(f"forecast.eventId {forecast['eventId']} ≠ event.id {doc['event']['id']}")
    want_card = project_card(forecast)
    missing = object()
    keys = dict.fromkeys([*doc["card"], *want_card])
    diff = [
        key for key in keys if not same_content(doc["card"].get(key, missing), want_card.get(key, missing))
    ]
    if diff:
        out.append(f"card가 forecast 투영과 다르다: {'·'.join(diff)}")

    # 출처별 근거 합집합과 예보서 묶음이 정확히 일치해야 한다.
    baseline = doc.get("baseline")
    wanted = ids(
        forecast["evidence"]
        + [e for s in doc["similar"] for e in s["evidence"]]
        + (baseline["evidence"] if baseline else [])
    )
    actual = ids(doc["evidence"])
    out.extend(f"evidence 묶음에 {e} 빠짐" for e in sorted(wanted - actual))
    out.extend(f"evidence 묶음에 출처 없는 {e}" for e in sorted(actual - wanted))
    for evidence in doc["evidence"]:
        if evidence.get("forecastId") and evidence["forecastId"] != forecast["id"]:
            out.append(f"evidence {evidence['id']} → 다른 예보 {evidence['forecastId']}")
    for similar in doc["similar"]:
        if similar["evidenceId"] not in ids(similar["evidence"]):
            out.append(f"similar {similar['eventId']} → 근거 {similar['evidenceId']}가 자기 evidence에 없음")
    if baseline:
        if baseline["evidenceId"] not in ids(baseline["evidence"]):
            out.append(f"baseline → 근거 {baseline['evidenceId']}가 자기 evidence에 없음")
        if baseline["sigunguCode"] != doc["event"]["sigunguCode"]:
            out.append(f"baseline 지역 {baseline['sigunguCode']} ≠ 행사 지역 {doc['event']['sigunguCode']}")

    # 발행 문장의 검사 revision은 발행 스냅샷의 내용 revision과 같아야 한다.
    for claim in doc["claims"]:
        if claim["sessionId"] != doc["sessionId"]:
            out.append(f"claim {claim['id']} → 다른 세션 {claim['sessionId']}")
        if claim["forecastId"] != doc["forecastId"]:
            out.append(f"claim {claim['id']} → 다른 예보 {claim['forecastId']}")
        for check in claim["checks"]:
            if check["revision"] != doc["revision"]:
                out.append(
                    f"claim {claim['id']} {check['checkKind']} 검사 revision {check['revision']}"
                    f" ≠ 발행 revision {doc['revision']}"
                )
    return out
