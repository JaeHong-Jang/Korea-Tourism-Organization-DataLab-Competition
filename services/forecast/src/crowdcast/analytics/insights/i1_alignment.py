"""등록 기간을 사용한 단위 환산과 실제 집계 기준의 일치 여부를 구분한다."""

from typing import Any

from crowdcast.analytics.insights.records import day


# 집계 구역이나 대상을 추측하지 않고 확인된 보고서 기간으로만 환산한다.
def comparison_basis(row: dict[str, Any], report: dict | None = None) -> dict | None:
    announced, observed = row.get("announced"), row.get("observed")
    if announced is None or observed is None:
        return None
    result = {
        "status": "unverified",
        "announcedDaily": None,
        "observedDaily": None,
        "days": None,
        "observationPeriod": (
            {"from": report["from"], "to": report["to"]}
            if report and report.get("from") and report.get("to")
            else None
        ),
        "scope": report["scope"] if report else "집계 구역 미확인",
        "note": "기간·구역·대상 확인 필요",
        "formula": None,
        "ratio": None,
    }
    if report and report.get("periodLabel"):
        result["days"] = report["days"]
        result["note"] = "관측: 개최 행정동 · 발표 구역 미확인"
        if announced["value"] == observed["value"]:
            result["note"] = "동일 수치 · 독립 집계 미확인"
        return result
    if announced["unit"] == "매":
        result["note"] = "입장권·방문객 대상 다름"
        return result
    if report and (row.get("start") != report["from"] or row.get("end") != report["to"]):
        result["note"] = "행사·관측 기간 다름"
        return result
    if announced["unit"] != "명" or observed["unit"] != "명/일" or not report:
        return result
    start, end = day(report["from"]), day(report["to"])
    if start is None or end is None or end < start:
        return result

    # 전년도 개최계획의 연간 인원을 등록 일정으로 나눈 참고 환산이며 비교 확정이 아니다.
    days = (end - start).days + 1
    result.update(
        status="schedule_daily",
        announcedDaily={
            **announced,
            "value": round(announced["value"] / days, 2),
            "unit": "명/일",
            "label": "등록기간 기준 일평균 환산",
            "estimated": True,
        },
        observedDaily=observed.copy(),
        days=days,
        note="단위 환산 · 구역·대상 미확인",
        formula=f"발표값 ÷ 등록 행사일수 {days}일 · 발표 집계기간 일치 여부 미확인",
    )
    return result
