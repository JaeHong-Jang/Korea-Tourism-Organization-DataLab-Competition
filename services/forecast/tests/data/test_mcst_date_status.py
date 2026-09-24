"""일정 끝의 상태 표기·반복된 점만 정리하고 모호한 기간과 원문을 보존하는지 검증한다."""

from collections.abc import Callable
from datetime import date

import pytest
from crowdcast.data.mcst_festivals import dates, parse_workbook


# 검토에서 확인된 날짜 표기를 실제 xlsx로 읽어 기간 전체와 원문 보존을 확인한다.
@pytest.mark.parametrize(
    "value,year,start,end",
    [
        ("9. 28.~9. 29.(예정)", 2024, date(2024, 9, 28), date(2024, 9, 29)),
        ("05.03.~05.12.(예정)", 2024, date(2024, 5, 3), date(2024, 5, 12)),
        ("4.20.~4.22.예정", 2024, date(2024, 4, 20), date(2024, 4, 22)),
        ("3.22~3.24\n(예정)", 2024, date(2024, 3, 22), date(2024, 3, 24)),
        ("6. 14. ~ 6. 16.(예정)", 2024, date(2024, 6, 14), date(2024, 6, 16)),
        ("09.01.~09.03\n(유동적)", 2023, date(2023, 9, 1), date(2023, 9, 3)),
        ("2023.2.3.~2.4.(예정)", 2023, date(2023, 2, 3), date(2023, 2, 4)),
        ("09.21..~09.23.", 2023, date(2023, 9, 21), date(2023, 9, 23)),
        (" \n5.4~5.6 \n( 잠정 ) \n", 2025, date(2025, 5, 4), date(2025, 5, 6)),
        (" \n5.4~5.6 \n예정 \n", 2025, date(2025, 5, 4), date(2025, 5, 6)),
        ("5.4~2023.05..06", 2023, date(2023, 5, 4), date(2023, 5, 6)),
        ("5.4..~5.6...(예정)", 2025, date(2025, 5, 4), date(2025, 5, 6)),
        ("5.4~5.6(3일간)\n(예정)", 2025, date(2025, 5, 4), date(2025, 5, 6)),
        ("6.9.~6.11.\n(3일간예정)", 2018, date(2018, 6, 9), date(2018, 6, 11)),
        ("10.5~10.7 예정\n(3일간)", 2018, date(2018, 10, 5), date(2018, 10, 7)),
        ("10.6.\n(1일간, 예정)", 2018, date(2018, 10, 6), date(2018, 10, 6)),
        ("5.5~5.7\n(3일간,예정)", 2018, date(2018, 5, 5), date(2018, 5, 7)),
        ("5.4~5.6\n(3일 간)", 2018, date(2018, 5, 4), date(2018, 5, 6)),
        ("8.3~8.4\n/2일간", 2019, date(2019, 8, 3), date(2019, 8, 4)),
        ("4.13.~4. 21.\n(9일간/예정)", 2018, date(2018, 4, 13), date(2018, 4, 21)),
        ("10.5~10.7\n(예정, 3일간)", 2018, date(2018, 10, 5), date(2018, 10, 7)),
        ("6.7.~ 6.9.\n3일간)", 2018, date(2018, 6, 7), date(2018, 6, 9)),
        ("5.4.~5.5\n/2일간.", 2019, date(2019, 5, 4), date(2019, 5, 5)),
        ("5.3~5일", 2023, date(2023, 5, 3), date(2023, 5, 5)),
        ("9.2~9.7(확정)", 2025, date(2025, 9, 2), date(2025, 9, 7)),
        ("4.15.~4.16.\n(일정변경가능)", 2023, date(2023, 4, 15), date(2023, 4, 16)),
        ("9. 28.~9. 29.(예상)", 2024, date(2024, 9, 28), date(2024, 9, 29)),
        ("4.13.(변경가능)", 2024, date(2024, 4, 13), date(2024, 4, 13)),
        ("10.27.~10.28.(안)", 2023, date(2023, 10, 27), date(2023, 10, 28)),
        ("2023.1.1.(종료)", 2023, date(2023, 1, 1), date(2023, 1, 1)),
    ],
)
def test_planned_date_range_preserves_original(
    xlsx: Callable,
    value: str,
    year: int,
    start: date,
    end: date,
) -> None:
    path = xlsx([["시도명", "축제명", "개최기간"], ["전북", "부안마실축제", value]], sheet_name="세부현황")
    (record,) = parse_workbook(path, year)
    assert (record["start_date"], record["end_date"], record["days"]) == (start, end, (end - start).days + 1)
    assert record["planned_month"] == start.month
    assert record["date_text"] == value


# 허용된 상태 표기를 떼어도 복수·부분·깨진 기간과 역전된 연도는 계속 보류한다.
@pytest.mark.parametrize(
    "value",
    [
        "4.30.~6.4. / 9.16~10.22.",
        "9.2~9.7중 3일간",
        "9.2~9.7(중 2일)",
        "24.10.~25.1.",
        "02.21.~.4.30.",
        "12.31.~'23.1.1.",
        "(예정)9.2~9.7",
        "9.2(예정)~9.7",
        "8.30~9.2\n3일간",
        "9.2~9.7\n(2일간, 예정)",
        "4. 1. ~ 4. 2.\n(미확정)",
        "9.2~9.7개최예정",
        "9.2~9.7(취소)",
        "9.2~9.7 검토중",
        "2023.13..30~2024.01.28.",
    ],
)
@pytest.mark.parametrize("status", ["", "\n(예정)"])
def test_status_cleanup_keeps_ambiguous_dates_null(xlsx: Callable, value: str, status: str) -> None:
    raw = value + status
    path = xlsx([["시도명", "축제명", "개최기간"], ["서울", "서울문화의 밤", raw]])
    (record,) = parse_workbook(path, 2023)
    assert record["start_date"] is record["end_date"] is None
    assert record["date_text"] == raw


# 상태 표기를 떼어도 명시 일수가 기간과 다르면 날짜를 채우지 않는다.
@pytest.mark.parametrize("stated", [None, "3일간"])
def test_status_cleanup_preserves_duration_check(stated: str | None) -> None:
    assert dates("5.4~5.6(2일간)\n(예정)", 2025, stated) == (None, None, 2 if stated is None else 3)
