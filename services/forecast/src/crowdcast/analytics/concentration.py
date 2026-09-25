"""시군구 관광지 집중률 30일 예측(한국관광공사 15128555)을 행사 기간 평균·붐비는 관광지로 요약한다."""

from collections import defaultdict
from datetime import date, datetime
from statistics import mean
from typing import Any

DATASET_ID = "ds-kto-concentration-15128555"


# 응답 날짜(YYYYMMDD)를 날짜로, 집중률 문자열을 숫자로 읽고 둘 중 하나라도 없으면 버린다.
def parse_rows(rows: list[dict[str, Any]]) -> list[tuple[date, str, float]]:
    parsed = []
    for row in rows:
        try:
            day = datetime.strptime(str(row["baseYmd"]), "%Y%m%d").date()
            rate = float(row["cnctrRate"])
        except (KeyError, TypeError, ValueError):
            continue
        name = str(row.get("tAtsNm") or "").strip()
        if name and rate >= 0:
            parsed.append((day, name, rate))
    return parsed


# 행사일이 예측 범위 밖이면 평균을 만들지 않고, 소수 한 자리로 반올림해 돌려준다.
def summarize(sigungu_code: str, start: date, end: date, rows: list[dict[str, Any]]) -> dict[str, Any]:
    parsed = parse_rows(rows)
    fetched = sorted(str(row["available_at"]) for row in rows if row.get("available_at"))
    result: dict[str, Any] = {
        "sigunguCode": sigungu_code,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "status": "empty",
        "fetchedAt": fetched[0] if fetched else None,
        "windowFrom": None,
        "windowTo": None,
        "attractions": len({name for _, name, _ in parsed}),
        "eventMean": None,
        "windowMean": None,
        "days": [],
        "top": [],
        "datasetId": DATASET_ID,
    }
    if not parsed:
        return result
    days = sorted({day for day, _, _ in parsed})
    result["windowFrom"], result["windowTo"] = days[0].isoformat(), days[-1].isoformat()
    result["windowMean"] = round(mean(rate for _, _, rate in parsed), 1)
    inside = [(day, name, rate) for day, name, rate in parsed if start <= day <= end]
    if not inside:
        result["status"] = "out_of_window"
        return result
    by_day: dict[date, list[float]] = defaultdict(list)
    by_name: dict[str, list[float]] = defaultdict(list)
    for day, name, rate in inside:
        by_day[day].append(rate)
        by_name[name].append(rate)
    result["status"] = "ok"
    result["eventMean"] = round(mean(rate for _, _, rate in inside), 1)
    result["days"] = [
        {"date": day.isoformat(), "mean": round(mean(rates), 1), "max": round(max(rates), 1)}
        for day, rates in sorted(by_day.items())
    ][:31]
    ranked = sorted(by_name.items(), key=lambda item: (-mean(item[1]), item[0]))[:5]
    result["top"] = [{"name": name, "rate": round(mean(rates), 1)} for name, rates in ranked]
    return result
