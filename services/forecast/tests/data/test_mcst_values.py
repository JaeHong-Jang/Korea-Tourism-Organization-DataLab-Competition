"""셀 값 해석(날짜·불확정 일정·단위 환산·주최 정리)을 원본 시트 없이 단위로 검증한다."""

from datetime import date, datetime

import pytest
from crowdcast.data.mcst_values import dates, integer


# 다양한 확정 날짜 표기와 연말 구간을 같은 양 끝 포함 일수로 해석한다.
@pytest.mark.parametrize(
    "value,year,start,end",
    [
        ("5.27~5.28", 2017, date(2017, 5, 27), date(2017, 5, 28)),
        ("2023-05-26 ~ 2023-05-27", 2023, date(2023, 5, 26), date(2023, 5, 27)),
        ("2023년 5월 26일~5월 27일", 2023, date(2023, 5, 26), date(2023, 5, 27)),
        ("'23.5.26.(금)∼5.27.(토)", 2023, date(2023, 5, 26), date(2023, 5, 27)),
        ("2023/5/26~27", 2023, date(2023, 5, 26), date(2023, 5, 27)),
        ("12.31~1.1", 2023, date(2023, 12, 31), date(2024, 1, 1)),
        ("전년12.30-익년1.1(3일)", 2018, date(2017, 12, 30), date(2018, 1, 1)),
        (datetime(2024, 2, 29), 2024, date(2024, 2, 29), date(2024, 2, 29)),
        ("10.3(1일간)", 2023, date(2023, 10, 3), date(2023, 10, 3)),
    ],
)
def test_dates(value: object, year: int, start: date, end: date) -> None:
    assert dates(value, year) == (start, end, (end - start).days + 1)


# 불확정·취소·반복·역전·잘못된 날짜를 확정된 DIY 기간으로 만들지 않는다.
@pytest.mark.parametrize(
    "value",
    [
        "10월 중",
        "미정",
        "5.1~5.3 개최취소",
        "5.1~5.31 매주 토요일",
        "5.30~5.1",
        "2023.2.29~3.1",
        "5.1~5.3, 9.1~9.3",
        "5.1~5월 말",
        "5.1, 5.3",
        "2023.12.31~2023.1.1",
        "5.1~5.7 중 3일간",
        "5.1~미정",
        "5.1~5.3 (가을 9.1~9.3)",
    ],
)
def test_uncertain_dates(value: str) -> None:
    assert dates(value, 2023)[:2] == (None, None)


# 명시 단위가 열 단위를 덮어쓰며 여러 숫자·음수·소수 인원은 보류한다.
@pytest.mark.parametrize(
    "value,heading,expected",
    [
        ("1.5", "천명", 1500),
        ("0", "천명", 0),
        ("1.25", "백만원", 1_250_000),
        ("12,000명", "천명", 12_000),
        ("1.2만명", "천명", 12_000),
        ("1,2", "명", None),
        ("미집계", "명", None),
        ("-3", "명", None),
        ("2022년 1000명", "명", None),
        ("1.5", "명", None),
        ("100/200", "명", None),
    ],
)
def test_integer_units(value: object, heading: str, expected: int | None) -> None:
    assert integer(value, heading) == expected


# 엑셀 숫자 셀(float)의 계산 흔적만 되돌리고 문자열로 적힌 소수 금액·인원은 정수로 바꾸지 않는다.
@pytest.mark.parametrize(
    "value,heading,expected",
    [
        (12.299999999999999, "예산(백만원)", 12_300_000),
        (1810.6000000000001, "예산(백만원)", 1_810_600_000),
        (12.3, "예산(백만원)", 12_300_000),
        ("123.005", "예산(원)", None),
        ("0.009", "방문객(명)", None),
        ("123.0000000001", "예산(원)", None),
        ("12.34567890123", "예산(백만원)", None),
        (1e15, "예산(원)", 1_000_000_000_000_000),
        (100000000000000.12, "예산(원)", None),
    ],
)
def test_integer_float_cells_only(value: object, heading: str, expected: int | None) -> None:
    assert integer(value, heading) == expected


# 별도 일수 칸의 띄어 쓴 '일 간'도 읽어 기간 길이와 대조한다.
def test_separate_duration_with_space() -> None:
    assert dates("5.4~5.6", 2025, "2일 간") == (None, None, 2)
    assert dates("5.4~5.6", 2025, "3일 간") == (date(2025, 5, 4), date(2025, 5, 6), 3)


# 원본의 '※예정'·'※ 잠정일자' 끝 표기도 떼고 기간 전체를 본다(2021 강원 E85~E88, 2018 경북 E60).
@pytest.mark.parametrize("value", ["5.7.~5.9.\n(3일간)\n※예정", "5.5 ~5.7\n(3일간)\n※ 잠정일자"])
def test_reference_mark_status(value: str) -> None:
    start, end, days = dates(value, 2021)
    assert days == 3 and start is not None and (end - start).days == 2
