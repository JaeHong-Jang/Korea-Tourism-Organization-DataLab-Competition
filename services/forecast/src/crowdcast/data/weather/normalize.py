"""기상청 실황·단기예보 행을 KST 시각별 기온·강수·하늘·풍속으로 정규화한다."""

import math
import re
from datetime import datetime, timedelta
from typing import Any

from crowdcast.data.call_ledger import KST
from crowdcast.data.datago_client import DataGoError

SKY = {1: "맑음", 3: "구름많음", 4: "흐림"}
PRECIPITATION = {
    0: "없음",
    1: "비",
    2: "비/눈",
    3: "눈",
    4: "소나기",
    5: "빗방울",
    6: "빗방울눈날림",
    7: "눈날림",
}
WIND = {1: "약한 바람", 2: "약간 강한 바람", 3: "강한 바람"}


# 시간대가 없는 입력은 KST로 해석하고 시간대가 있으면 KST로 변환한다.
def as_kst(value: datetime | str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
        if not isinstance(parsed, datetime):
            raise ValueError
        return parsed.replace(tzinfo=KST) if parsed.tzinfo is None else parsed.astimezone(KST)
    except (TypeError, ValueError):
        raise ValueError("datetime 또는 ISO 형식의 시각이 필요합니다") from None


# API의 날짜·시각 길이를 고정하고 자정 2400은 다음 날 00시로 바꾼다.
def api_time(day: Any, hour: Any) -> datetime:
    if (
        not isinstance(day, str)
        or not isinstance(hour, str)
        or not re.fullmatch(r"\d{8}", day)
        or not re.fullmatch(r"\d{4}", hour)
    ):
        raise ValueError
    midnight = datetime.strptime(day, "%Y%m%d").replace(tzinfo=KST)
    if hour == "2400":
        return midnight + timedelta(days=1)
    return datetime.strptime(day + hour, "%Y%m%d%H%M").replace(tzinfo=KST)


# 미제공 요소는 공통 필드를 None으로 남겨 맑음·무강수·무풍으로 오인하지 않게 한다.
def empty_record(valid_at: datetime) -> dict[str, Any]:
    return {
        "valid_at": valid_at.isoformat(),
        "temperature_c": None,
        "temperature_min_c": None,
        "temperature_max_c": None,
        "precipitation_probability_pct": None,
        "precipitation_type": None,
        "sky": None,
        "wind_speed_m_s": None,
        "wind_speed_category": None,
    }


# 공식 ±900 이상 결측값을 지우고 NaN·무한대·범위 밖 값은 성공 데이터로 쓰지 않는다.
def number(value: Any, lower: float = -899, upper: float = 899) -> float | None:
    if value in (None, "", "-"):
        return None
    if isinstance(value, bool):
        raise ValueError
    result = float(value)
    if not math.isfinite(result):
        raise ValueError
    if abs(result) >= 900:
        return None
    if not lower <= result <= upper:
        raise ValueError
    return result


# 코드표에 없는 값은 추측한 문구로 바꾸지 않는다.
def category(value: Any, labels: dict[int, str]) -> str | None:
    code = number(value)
    if code is None:
        return None
    if code not in labels:
        raise ValueError
    return labels[code]


# 발표·좌표 일치와 중복을 검증하고 페이지 경계를 넘어 같은 예보시각의 요소를 합친다.
def grid_records(
    rows: list[dict[str, Any]], *, nx: int, ny: int, issued_at: datetime, observed: bool
) -> list[dict[str, Any]]:
    records: dict[datetime, dict[str, Any]] = {}
    seen: set[tuple[datetime, str]] = set()
    try:
        for row in rows:
            if (
                row.get("nx") not in (nx, str(nx))
                or row.get("ny") not in (ny, str(ny))
                or api_time(row["baseDate"], row["baseTime"]) != issued_at
            ):
                raise ValueError
            valid_at = issued_at if observed else api_time(row["fcstDate"], row["fcstTime"])
            code = row["category"]
            if not isinstance(code, str) or (valid_at, code) in seen or valid_at < issued_at:
                raise ValueError
            seen.add((valid_at, code))
            record = records.setdefault(valid_at, empty_record(valid_at))
            value = row["obsrValue" if observed else "fcstValue"]
            assign_value(record, code, value, observed=observed, issued_at=issued_at, valid_at=valid_at)
    except (KeyError, TypeError, ValueError, OverflowError):
        raise DataGoError("기상청 실황·단기예보 항목 형식 오류: 발표·좌표·시각·값 확인") from None
    return [records[stamp] for stamp in sorted(records)]


# 기온·강수·하늘을 변환하고 연장구간 풍속 코드는 m/s와 별도 필드로 보존한다.
def assign_value(
    record: dict[str, Any], code: str, value: Any, *, observed: bool, issued_at: datetime, valid_at: datetime
) -> None:
    temperatures = {
        "T1H": "temperature_c",
        "TMP": "temperature_c",
        "TMN": "temperature_min_c",
        "TMX": "temperature_max_c",
    }
    if code in temperatures:
        record[temperatures[code]] = number(value)
    elif code == "POP":
        record["precipitation_probability_pct"] = number(value, 0, 100)
    elif code == "SKY":
        record["sky"] = category(value, SKY)
    elif code == "PTY":
        record["precipitation_type"] = category(
            value,
            PRECIPITATION if observed else {key: label for key, label in PRECIPITATION.items() if key <= 4},
        )
    elif code == "WSD":
        extension_day = issued_at.replace(hour=0) + timedelta(days=3 if issued_at.hour < 17 else 4)
        extended = (
            not observed and issued_at >= datetime(2024, 11, 28, 14, tzinfo=KST) and valid_at > extension_day
        )
        record["wind_speed_category" if extended else "wind_speed_m_s"] = (
            category(value, WIND) if extended else number(value, 0)
        )
    elif code == "RN1" and observed:
        record["precipitation_mm"] = number(value, 0)
