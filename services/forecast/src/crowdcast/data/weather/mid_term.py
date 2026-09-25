"""중기예보의 육상·기온 구역을 구분하고 오전·오후·일 단위 예보를 정규화한다."""

import re
from datetime import datetime, timedelta
from typing import Any

from crowdcast.data.datago_client import DataGoError
from crowdcast.data.weather.normalize import empty_record, number

# 기상청28 활용가이드의 육상 광역 구역이며 기온 구역으로 자동 치환하지 않는다.
LAND_REGIONS = {
    "11B00000",
    "11D10000",
    "11D20000",
    "11C20000",
    "11C10000",
    "11F20000",
    "11F10000",
    "11H10000",
    "11H20000",
    "11G00000",
}


# 광역 코드는 육상 날씨로, 도시 코드는 최저·최고기온으로 조회한다.
def region_api(region_code: str) -> str:
    if not isinstance(region_code, str) or not re.fullmatch(r"[12]1[A-H]\d{5}", region_code):
        raise ValueError("기상청 중기예보 구역 코드가 필요합니다")
    if region_code in LAND_REGIONS:
        return "mid_land"
    if region_code.endswith("0000"):
        raise ValueError("지원하지 않는 중기예보 광역 구역입니다")
    return "mid_temperature"


# 한 구역의 원본 필드를 날짜별로 풀고 미제공 날짜를 0 또는 맑음으로 채우지 않는다.
def mid_records(
    rows: list[dict[str, Any]], *, region_code: str, issued_at: datetime, temperature: bool
) -> list[dict[str, Any]]:
    try:
        if len(rows) != 1 or rows[0]["regId"] != region_code:
            raise ValueError
        item = rows[0]
        records = []
        first_day = 4 if issued_at.hour == 6 else 5
        for day in range(first_day, 11):
            periods = ("",) if temperature or day >= 8 else ("Am", "Pm")
            for period in periods:
                suffix = f"{day}{period}"
                fields = (f"taMin{day}", f"taMax{day}") if temperature else (f"rnSt{suffix}", f"wf{suffix}")
                if not any(field in item for field in fields):
                    continue
                valid_at = issued_at.replace(hour=12 if period == "Pm" else 0) + timedelta(days=day)
                record = empty_record(valid_at)
                record["valid_until"] = (valid_at + timedelta(hours=12 if period else 24)).isoformat()
                record["period"] = {"Am": "am", "Pm": "pm", "": "day"}[period]
                if temperature:
                    record["temperature_min_c"] = number(item.get(fields[0]))
                    record["temperature_max_c"] = number(item.get(fields[1]))
                    low, high = record["temperature_min_c"], record["temperature_max_c"]
                    if low is not None and high is not None and low > high:
                        raise ValueError
                else:
                    record["precipitation_probability_pct"] = number(item.get(fields[0]), 0, 100)
                    record["sky"], record["precipitation_type"] = land_weather(item.get(fields[1]))
                records.append(record)
        return records
    except (KeyError, TypeError, ValueError, OverflowError):
        raise DataGoError("기상청 중기예보 항목 형식 오류: 구역·날씨·기온 확인") from None


# 공식 복합 문구의 하늘상태와 강수형태만 분리하고 알 수 없는 표현은 거절한다.
def land_weather(value: Any) -> tuple[str | None, str | None]:
    if value in (None, "", "-"):
        return None, None
    if value in ("맑음", "구름많음", "흐림"):
        return value, "없음"
    if not isinstance(value, str):
        raise ValueError
    match = re.fullmatch(r"(구름많고|흐리고) (비/눈|비|눈|소나기)", value)
    if match is None:
        raise ValueError
    return ("구름많음" if match[1] == "구름많고" else "흐림"), match[2]
