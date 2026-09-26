"""원본 대조에서 발견한 날짜·단위·주석 오인을 작은 xlsx로 재현한다."""

import json
from collections.abc import Callable
from datetime import date

import pytest
from crowdcast.data.mcst_festivals import parse_workbook
from crowdcast.data.mcst_values import dates, planned_month


# 2023년 세부현황 733·757행은 끝 날짜만 채택하거나 월을 연도로 오인하면 안 된다.
def test_reviewed_2023_periods(xlsx: Callable) -> None:
    path = xlsx(
        [
            ["광역단체명", "기초단체명", "축제명", "개최기간"],
            ["전북", "무주군", "무주꽁꽁놀이축제", "2023.12..30~2024.01.28."],
            ["전북", "부안군", "부안마실축제", "05.04-05.06"],
        ],
        sheet_name="세부현황",
    )
    winter, valid = parse_workbook(path, 2023)
    assert (winter["start_date"], winter["end_date"], winter["days"]) == (
        date(2023, 12, 30),
        date(2024, 1, 28),
        30,
    )
    assert winter["date_text"] == "2023.12..30~2024.01.28."
    assert winter["planned_month"] is None
    assert (valid["start_date"], valid["end_date"], valid["days"]) == (date(2023, 5, 4), date(2023, 5, 6), 3)
    assert valid["planned_month"] == 5


# 기간 앞뒤의 알 수 없는 문구와 깨진 구분자를 잘라내 유효한 날짜로 만들지 않는다.
@pytest.mark.parametrize(
    "value",
    [
        "잘못된 5.4~5.6",
        "5.4~5.6 검토중",
        "2023.13.30~2024.01.28.",
        "미정~5.6",
        "5.4~5.6(취소)",
        "2023.5.4~2023.5.6~2023.5.7",
        "5.4~5.6(기간 중 2일)",
    ],
)
def test_only_complete_periods_are_accepted(value: str) -> None:
    assert dates(value, 2023)[:2] == (None, None)


# 월일 사이 하이픈과 생략된 끝 일자는 두 자리 연도로 바뀌지 않는다.
@pytest.mark.parametrize("value", ["05.04-05.06", "05.04-06", "5.4~5.6", "23.5.4~6", "2023-05-04~06"])
def test_short_range_is_not_a_two_digit_year(value: str) -> None:
    assert dates(value, 2023) == (date(2023, 5, 4), date(2023, 5, 6), 3)


# 2021년 서울 I6의 225는 J5 아래 단위 행을 읽어 2억 2천5백만원으로 환산한다.
def test_budget_unit_below_header(xlsx: Callable) -> None:
    path = xlsx(
        [
            ["2021년 지역축제 개최계획 총괄표"],
            [],
            [],
            [
                "연번",
                "시도명",
                "시군구명",
                "축제명",
                "2021년 개최기간",
                "축제주요내용",
                "주최/주관",
                "최초개최년도",
                "2021년 축제예산",
                "국비",
                "시,도비",
                "구,군비",
                "기타",
            ],
            [None] * 8 + ["합계", "(단위 : 백만원)"],
            [1, "서울특별시", "마포구", "서울억새축제", "10.15~10.21", None, None, 2002, 225, 0, 225],
        ],
        ("J5:M5",),
    )
    (record,) = parse_workbook(path, 2021)
    assert record["budget_krw"] == 225_000_000
    assert record["source_row"] == 6


# 2017년 대전의 별도 일수는 괄호 유무와 무관하게 기간과 대조한다.
@pytest.mark.parametrize(
    "period,stated,expected",
    [
        ("4.7~4.9", "3일간", (date(2017, 4, 7), date(2017, 4, 9), 3)),
        ("4.28~4.30", "3일간", (date(2017, 4, 28), date(2017, 4, 30), 3)),
        ("5.12~14", "3일간", (date(2017, 5, 12), date(2017, 5, 14), 3)),
        ("8.26~8.27", "2일간", (date(2017, 8, 26), date(2017, 8, 27), 2)),
        ("9.1~9.3", "3일간", (date(2017, 9, 1), date(2017, 9, 3), 3)),
        ("10.21~24", "4일간", (date(2017, 10, 21), date(2017, 10, 24), 4)),
        ("4.7~4.9", "2일간", (None, None, 2)),
        ("9~10월", "3일간", (None, None, 3)),
    ],
)
def test_legacy_separate_duration(xlsx: Callable, period: str, stated: str, expected: tuple) -> None:
    path = xlsx(
        [
            ["시도명", "시군구명", "축제명", "개최기간", None],
            ["대전", "대덕구", "금강로하스축제", period, stated],
        ],
        ("D1:E1",),
        "대전",
    )
    (record,) = parse_workbook(path, 2017)
    assert (record["start_date"], record["end_date"], record["days"]) == expected
    assert record["date_text"] == period


# 2018년 강원 A82:I95 같은 주석과 시도 불일치를 빼되 행사명에서 시작한 병합은 보존한다.
def test_merged_comment_and_wrong_sido_are_excluded(xlsx: Callable) -> None:
    path = xlsx(
        [
            ["연번", "시도명", "시군구명", "축제명", "개최기간"],
            [1, "강원도", "춘천시", "춘천마임축제", "5.20~5.27"],
            ["전년대비 축제 증가사유(68개→75개/ 7개)"],
            [],
            [2, "서울", "중구", "서울문화의 밤", "8.11"],
            [3, "강원", "춘천시", "춘천막국수닭갈비축제"],
            [4, None, "평창군", "평창효석문화제", "9.1~9.9"],
        ],
        ("A3:E4", "D6:E6"),
        "10_강원도",
    )
    records = parse_workbook(path, 2018)
    assert [row["source_row"] for row in records] == [2, 6, 7]
    assert {row["sido"] for row in records} == {"강원특별자치도"}


# 날짜가 미정이어도 단일 월이 확실한 원문만 월 단위 행사 매칭에 제공한다.
@pytest.mark.parametrize(
    "value,expected",
    [
        ("10월중", 10),
        ("2024. 7.", 7),
        (" 10월 중\n(3일간) ", 10),
        ("22. 10월", 10),
        ("9월 말~10월 초", None),
        ("9~10월", None),
        ("12.31~1.1", None),
        ("2024.5.31~2024.6.1", None),
        ("2024.7.1~7.3", 7),
        ("13월 중", None),
        ("0월", None),
        ("미정", None),
        (None, None),
    ],
)
def test_planned_month(value: object, expected: int | None) -> None:
    assert planned_month(value, 2024) == expected


# 날짜 원문은 결측용 문자열과 앞뒤 공백·줄바꿈까지 그대로 남긴다.
@pytest.mark.parametrize("raw,month", [(" 10월 중\n(3일간) ", 10), ("미정", None), ("-", None), (None, None)])
def test_original_date_text_is_preserved(xlsx: Callable, raw: str | None, month: int | None) -> None:
    path = xlsx([["시도명", "축제명", "개최기간"], ["서울", "서울억새축제", raw]])
    (record,) = parse_workbook(path, 2024)
    assert record["date_text"] == raw
    assert record["planned_month"] == month
    assert record["start_date"] is record["end_date"] is None


# 분리 연월일의 일자가 없더라도 두 달이 같으면 월을 보존하고 원본 값 배열을 남긴다.
def test_partial_split_calendar_keeps_raw_cells(xlsx: Callable) -> None:
    path = xlsx(
        [
            ["시도명", "축제명", "개최기간", None, None, None, None, None, None, None],
            [None, None, "시작일", None, None, "종료일", None, None, "총일수", "비고"],
            [None, None, "년", "월", "일", "년", "월", "일"],
            ["서울", "서울억새축제", 2025, 10, "미정", 2025, 10, None, 3, "10월 중\n확정 예정"],
        ],
        ("A1:A3", "B1:B3", "C1:J1", "C2:E2", "F2:H2", "I2:I3", "J2:J3"),
    )
    (record,) = parse_workbook(path, 2025)
    assert record["start_date"] is record["end_date"] is None
    assert record["planned_month"] == 10
    assert record["days"] == 3
    assert json.loads(record["date_text"]) == {
        "start": [2025, 10, "미정"],
        "end": [2025, 10, None],
        "days": 3,
        "note": "10월 중\n확정 예정",
    }
