"""문체부 개최계획 셀 값 해석 — 문구 정리·단위 환산·일수·일정(상태 표기 포함)·개최 달."""

import re
from datetime import date, datetime
from decimal import Decimal

# 값이 없다는 표기는 빈 문자열 대신 null로 저장한다.
MISSING = {"", "-", "--", "미정", "미상", "미집계", "미작성", "미기재", "없음", "해당없음", "모름"}


# 원문 문구는 공백만 정리하고 의미를 알 수 없는 값은 보충하지 않는다.
def text(value: object) -> str | None:
    result = re.sub(r"\s+", " ", str(value)).strip() if value is not None else ""
    return None if result in MISSING else result


# 머리글과 분류의 띄어쓰기·문항 번호를 비교용으로만 제거한다.
def key(value: object) -> str:
    return re.sub(r"^[\d.·ㅇ_]+", "", re.sub(r"\s+", "", str(value or "")))


# 셀의 명시 단위를 우선하고 단일 수치만 정수 원·명으로 환산한다.
def integer(value: object, heading: str = "") -> int | None:
    raw = str(value).strip()
    # 엑셀 float 셀: 정수는 그대로, 10억 미만의 계산 흔적만 15자리로 되돌린다(12.2999…→12.3)
    if isinstance(value, float):
        raw = (
            str(int(value))
            if value.is_integer()
            else format(value, ".15g")
            if abs(value) < 1e9
            else repr(value)
        )
    match = re.fullmatch(r"(\d+(?:,\d{3})*(?:\.\d+)?)\s*(백만|천만|억|만|천)?\s*(원|명)?", raw)
    if not match:
        return None
    units = {"백만": 1_000_000, "천만": 10_000_000, "억": 100_000_000, "만": 10_000, "천": 1000}
    unit = match[2] if match[2] or match[3] else next((u for u in units if u in heading), None)
    amount = Decimal(match[1].replace(",", "")) * units.get(unit, 1)
    return int(amount) if amount == amount.to_integral_value() else None


# 별도 일수 셀의 숫자와 일간 표기를 기간 문자열과 독립적으로 해석한다.
def duration(value: object) -> int | None:
    match = re.fullmatch(r"\s*\(?(?:총\s*)?(\d+)\s*(?:일\s*(?:간)?)?\)?\s*", str(value))
    return int(match[1]) if match and int(match[1]) >= 1 else None


# 일정 끝의 상태 표기(예정·잠정·유동적·안·예상·확정·종료·변경가능) — 떼어 낸 뒤 기간 전체를 검사한다
STATUS_SUFFIX = re.compile(
    r"\s*(?:\(\s*(?:예정|잠정|유동적|안|예상|확정|종료|(?:일정\s*)?변경\s*가능)\s*\)|예정|※\s*(?:예정|잠정(?:\s*일자)?))\s*$"
)


# 끝의 일수 표기: 괄호·슬래시 뒤는 N일, 공백 뒤 맨 형태는 N일간만(5월 27일·5.3~5일은 날짜)
DURATION_SUFFIX = re.compile(
    r"(?:\s*/\s*|\s*\(\s*)(?:예정\s*[,/]\s*)?(?:총\s*)?(\d+)\s*일\s*간?\s*(?:[,/]?\s*예정)?\s*\)?\s*\.?\s*$"
    r"|(?<=\s)(?:총\s*)?(\d+)\s*일\s*간\s*(?:[,/]?\s*예정)?\s*\)?\s*\.?\s*$"
)


# 기간 전체를 검증해 깨진 시작일의 뒷부분이나 끝 날짜만 채택하지 않는다.
def dates(value: object, year: int, stated: object = None) -> tuple[date | None, date | None, int | None]:
    days = duration(stated)
    if isinstance(value, datetime | date):
        day = value.date() if isinstance(value, datetime) else value
        return (day, day, 1) if days in (None, 1) else (None, None, days)
    # 상태 표기 → 끝의 일수 표기 → (일수 앞에 있던) 상태 표기 순으로 떼고, 일수는 기간 길이와 대조한다.
    raw = re.sub(STATUS_SUFFIX, "", str(value or ""))
    suffix = DURATION_SUFFIX.search(raw)
    if suffix:
        inline_days = int(suffix[1] or suffix[2])
        if days is not None and days != inline_days:
            return None, None, days
        days = inline_days
        raw = re.sub(STATUS_SUFFIX, "", raw[: suffix.start()])
    cleaned = re.sub(r"\([월화수목금토일](?:요일)?\)|\s", "", raw)
    cleaned = re.sub(r"[∼～〜–]", "~", cleaned.replace("’", "'").replace("`", "'"))
    # 반복된 점만 하나로 정리하고 빠진 월·일이나 구분자는 추정하지 않는다.
    cleaned = re.sub(r"\.{2,}", ".", cleaned)
    # 두 자리 연도는 점·슬래시 세 부분이나 따옴표가 있어야 월일 범위와 구분된다.
    day_pattern = r"(?:(\d{4}|'\d{2}|\d{2}(?=[./]\d{1,2}[./]))[년./-])?(\d{1,2})[월./-](\d{1,2})일?\.?"
    match = re.fullmatch(rf"(전년)?{day_pattern}(?:[~-](익년)?(?:{day_pattern}|(\d{{1,2}})일?\.?))?", cleaned)
    if not match:
        return None, None, days
    previous, sy, sm, sd, following, ey, em, ed, end_day = match.groups()
    try:
        start_year = (2000 + int(sy.lstrip("'")) if len(sy.lstrip("'")) == 2 else int(sy)) if sy else year
        start = date(start_year - bool(previous and not sy), int(sm), int(sd))
        end_year = (2000 + int(ey.lstrip("'")) if len(ey.lstrip("'")) == 2 else int(ey)) if ey else start.year
        if not ey and (following or (int(sm) == 12 and em and int(em) == 1)):
            end_year += 1
        end = date(end_year, int(em or sm), int(ed or end_day or sd))
        if end < start or (days is not None and days != (end - start).days + 1):
            return None, None, days
        return start, end, (end - start).days + 1
    except ValueError:
        return None, None, days


# 단일 월만 명확한 일정에서 개최 달을 남기고 두 달 이상인 범위는 보류한다.
def planned_month(value: object, year: int) -> int | None:
    start, end, _ = dates(value, year)
    if start and end:
        return start.month if (start.year, start.month) == (end.year, end.month) else None
    raw = re.sub(r"\s|\(\s*\d+\s*일(?:간)?\s*\)", "", str(value or ""))
    match = re.fullmatch(
        r"(?:(?:\d{4}|'?\d{2})[년./])?(0?[1-9]|1[0-2])(?:월|\.)(?:중|초|말|상순|중순|하순)?(?:예정)?", raw
    )
    return int(match[1]) if match else None
