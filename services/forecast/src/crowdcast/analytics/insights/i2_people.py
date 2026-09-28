"""같은 저장 예보의 일평균·순간 최대 구간을 행사 식별자와 함께 인사이트 근거로 전달한다."""

from math import isfinite
from typing import Any


# 일부 인원 값이 없거나 뒤집혔으면 다른 예보의 숫자로 대신 채우지 않는다.
def forecast_people(
    forecasts: list[dict[str, Any]], events: dict[str, dict[str, Any]]
) -> list[dict[str, Any]] | None:
    result = []
    for forecast in forecasts:
        quantities = {}
        for field, unit in (("dailyMean", "명/일"), ("peakConcurrent", "명")):
            quantity = forecast.get(field, {})
            values = [quantity.get(key) for key in ("p10", "p50", "p90")]
            if quantity.get("unit") != unit or any(
                type(value) not in (float, int) or not isfinite(value) or value < 0 for value in values
            ):
                return None
            if not values[0] <= values[1] <= values[2]:
                return None
            quantities[field] = {key: quantity[key] for key in ("p10", "p50", "p90", "unit")}
        event = events[forecast["eventId"]]
        result.append(
            {
                "forecastId": forecast["id"],
                "eventId": forecast["eventId"],
                "name": event["name"],
                "start": str(event.get("start") or ""),
                "end": str(event.get("end") or ""),
                **quantities,
            }
        )
    return result
