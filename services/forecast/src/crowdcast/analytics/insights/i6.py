"""일괄 예보 연도의 행사 마스터를 시도·개최 월별로 세고 예보 인원을 별도로 합한다."""

from collections import defaultdict
from typing import Any

from crowdcast.analytics.insights.evidence import data_evidence, forecast_evidence, insight
from crowdcast.analytics.insights.records import PLANS, Inputs, number


# 개최계획서가 병합된 행사 마스터로 중복을 제거하고 시작 월에 한 번만 배정한다.
def calculate(inputs: Inputs) -> dict[str, Any]:
    events = inputs.event_index()
    forecasts = {row["eventId"]: row for row in inputs.forecasts}
    years = {events[key]["year"] for key in forecasts}
    if not years and events:
        years = {max(row["year"] for row in events.values())}
    groups: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: {"count": 0, "peak": 0, "n": 0})
    rows = []
    for event in events.values():
        if event["year"] not in years:
            continue
        month = event["start"].month if event.get("start") else event.get("planned_month")
        if not month or not 1 <= month <= 12 or not event.get("sido"):
            continue
        group = groups[event["sido"], f"{event['year']}-{month:02d}"]
        group["count"] += 1
        forecast = forecasts.get(event["event_id"])
        if forecast and (value := number(forecast["peakConcurrent"]["p50"])) is not None:
            group["peak"] += value
            group["n"] += 1
        rows.append(event)
    series = []
    for (sido, month), group in sorted(groups.items()):
        series.append({"label": f"{sido} {month} · 행사 수(건)", "value": group["count"]})
        if group["n"]:
            series.append(
                {
                    "label": f"{sido} {month} · 예보 {int(group['n'])}건 순간 인파 합(명, 추정)",
                    "value": group["peak"],
                }
            )
    value = sum(group["peak"] for group in groups.values())
    used_period = {"from": f"{min(years)}-01-01", "to": f"{max(years)}-12-31"} if years else None
    content = {
        "eventCount": len(rows),
        "forecastCount": int(sum(g["n"] for g in groups.values())),
        "peakSum": value,
        "note": "개최 시작 월 기준; 일정 미정은 계획 월; 마스터 행사 ID 중복 제거",
        "missingForecast": "미예보는 합계에서 제외(영 인원 아님)",
        "forecastIds": [row["id"] for row in inputs.forecasts],
    }
    evidence = [data_evidence(inputs, PLANS, rows, content, input_name="events", used_period=used_period)]
    evidence.extend(forecast_evidence(inputs))
    return insight(
        inputs,
        "I6",
        "월·지역별 행사 밀도",
        value,
        "명",
        "시도×개최 월별 행사 수와 순간 인파 예보 합(추정); 동시 발생 인원·고유 방문객 합계 아님",
        rows,
        series,
        evidence,
        pairs=content["forecastCount"],
        used_period=used_period,
    )
