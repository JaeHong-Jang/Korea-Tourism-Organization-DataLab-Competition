"""머리글·병합·금액·방문객의 의미와 날짜 해석을 합성 xlsx로 검증한다."""

from collections.abc import Callable
from datetime import date, datetime

from crowdcast.data.mcst_festivals import host_name, parse_workbook
from crowdcast.data.mcst_values import dates


# 첫 행이 아닌 머리글과 가로 단위 병합·세로 지역 병합을 함께 복원한다.
def test_legacy_merged_headers_and_provenance(xlsx: Callable) -> None:
    path = xlsx(
        [
            ["2017년 지역축제 개최계획"],
            [],
            [],
            [],
            [None] * 7 + ["예산(백만원)", "방문객수(2016년기준, 단위 : 천명)", None],
            [
                "시도명",
                "시군구명",
                "축제명",
                "2017년 개최기간",
                "축제종류(택1)",
                "개최장소",
                "주최/주관",
                "축제예산",
                "합 계",
                "내국인",
            ],
            [
                "서울특별시",
                "중구",
                "서울드럼페스티벌",
                "5.27~5.28",
                "문화예술",
                "서울광장",
                "서울시 문화예술과\n(담당자 연락처)",
                "1.25",
                "1.5",
                "1.0",
            ],
            [None, None, "서울아리랑페스티벌", "10.12~10.14", "전통역사", "광화문광장", None, 0, 0, 0],
            [None, None, "서울문화의 밤", "8월 중", "알 수 없는 분류", None, None, "미정", "미집계"],
            [None, None, "합계"],
        ],
        ("I5:J5", "A7:A8", "B7:B8"),
    )
    rows = parse_workbook(path, 2017, "2017_festival/원본.xlsx")
    assert len(rows) == 3
    first, second, unknown = rows
    assert first["source_file"] == "2017_festival/원본.xlsx"
    assert (first["source_sheet"], first["source_row"]) == ("서울", 7)
    assert first["budget_krw"] == 1_250_000
    assert first["visitors_announced"] == 1500
    assert first["visitors_announced_meaning"] == "방문객수(2016년기준, 단위 : 천명) / 합 계"
    assert first["host"] == "서울시 문화예술과"
    assert (first["type"], first["days"]) == ("공연", 2)
    assert (second["sido"], second["sigungu_name"]) == ("서울특별시", "중구")
    assert second["budget_krw"] == second["visitors_announced"] == 0
    assert unknown["sido"] == "서울특별시"
    assert unknown["sigungu_name"] is None
    assert unknown["type"] == "기타"
    assert unknown["start_date"] is unknown["end_date"] is unknown["days"] is None


# 내·외국인 분리 양식은 완전한 두 값만 더하고 가로 병합 합계는 한 번만 센다.
def test_component_visitors_and_split_budget(xlsx: Callable) -> None:
    path = xlsx(
        [
            [
                "광역단체명",
                "기초단체명",
                "축제명",
                "개최기간",
                "축제유형",
                "개최장소",
                "예산(백만원)",
                None,
                "방문객수(前년)",
                None,
            ],
            [None] * 6 + ["국비", "합계", "내국인(명)", "외국인(명)"],
            [
                "서울",
                "용산구",
                "서울드럼페스티벌",
                "05.26.~05.27.",
                "문화예술",
                "노들섬",
                20,
                560,
                9000,
                1000,
            ],
            ["서울", "중구", "서울뮤직페스티벌", "10.20~10.22", "문화예술", "서울광장", 10, 200, 10000, None],
            ["제주", "제주시", "탐라국 입춘굿", "2.2~2.4", "전통역사", "제주목관아", 0, 100, 15000, None],
        ],
        ("A1:A2", "B1:B2", "C1:C2", "D1:D2", "E1:E2", "F1:F2", "G1:H1", "I1:J1", "I5:J5"),
        "세부현황",
    )
    first, incomplete, merged = parse_workbook(path, 2023)
    assert first["budget_krw"] == 560_000_000
    assert first["visitors_announced"] == 10_000
    assert "내국인(명)" in first["visitors_announced_meaning"]
    assert "외국인(명)" in first["visitors_announced_meaning"]
    assert incomplete["visitors_announced"] is None
    assert merged["visitors_announced"] == 15_000


# 2025년의 연월일 분리·예산 합계의 병합 범위 이탈·장소 유형 중복 제목을 검증한다.
def test_split_calendar_and_total_outside_budget_merge(xlsx: Callable) -> None:
    path = xlsx(
        [
            [
                "광역자치단체명",
                "기초자치단체명",
                "축제명",
                "축제 유형",
                "개최 장소",
                None,
                "개최기간",
                None,
                None,
                None,
                None,
                None,
                None,
                "예산(백만원)",
                None,
                "방문객수(前년)",
            ],
            [
                None,
                None,
                None,
                None,
                "장소명",
                "축제 유형",
                "시작일",
                None,
                None,
                "종료일",
                None,
                None,
                "합계",
                "국비",
                "지방비",
                "전체",
            ],
            [None] * 6 + ["년", "월", "일", "년", "월", "일"],
            [
                "10. 강원",
                "춘천시",
                "춘천마임축제",
                "01. 문화예술",
                "공지천",
                "수변형",
                2025,
                5,
                25,
                2025,
                6,
                1,
                650,
                100,
                550,
                18000,
            ],
            [
                "강원",
                "춘천시",
                "춘천막국수닭갈비축제",
                "지역특산물",
                "공지천",
                "수변형",
                2025,
                6,
                None,
                2025,
                6,
                None,
                700,
                100,
                600,
                "최초 행사",
            ],
        ],
        (
            "A1:A3",
            "B1:B3",
            "C1:C3",
            "D1:D3",
            "E1:F1",
            "E2:E3",
            "F2:F3",
            "G1:L1",
            "G2:I2",
            "J2:L2",
            "M2:M3",
            "N1:O1",
            "N2:N3",
            "O2:O3",
            "P2:P3",
        ),
        "10_강원도",
    )
    first, incomplete = parse_workbook(path, 2025)
    assert first["type"] == "공연"
    assert first["sido"] == "강원특별자치도"
    assert (first["start_date"], first["end_date"], first["days"]) == (date(2025, 5, 25), date(2025, 6, 1), 8)
    assert first["budget_krw"] == 650_000_000
    assert first["visitors_announced"] == 18000
    assert incomplete["start_date"] is incomplete["end_date"] is None
    assert first["planned_month"] is None
    assert incomplete["planned_month"] == 6


# 날짜 형식으로 저장된 엑셀 셀과 명시 단위 없는 예산을 임의 환산하지 않는다.
def test_excel_date_cell_and_unstated_budget_unit(xlsx: Callable) -> None:
    path = xlsx(
        [
            ["시도명", "축제명", "개최기간", "예산", "전년도 방문객"],
            ["서울", "서울문화의 밤", datetime(2024, 10, 3), 300, 1500],
        ]
    )
    record = parse_workbook(path, 2024)[0]
    assert record["start_date"] == record["end_date"] == date(2024, 10, 3)
    assert record["days"] == 1
    assert record["budget_krw"] is None
    assert record["visitors_announced"] == 1500
    assert record["visitors_announced_meaning"] == "전년도 방문객"


# 여러 행사에 걸친 방문객 병합은 행사별 합계로 복제하지 않는다.
def test_visitors_shared_between_festivals(xlsx: Callable) -> None:
    path = xlsx(
        [
            ["시도명", "축제명", "개최기간", "전년도 방문객"],
            ["서울", "서울드럼페스티벌", "5.25~5.26", 1500],
            ["서울", "서울문화의 밤", "10.3", None],
        ],
        ("D2:D3",),
    )
    assert all(row["visitors_announced"] is None for row in parse_workbook(path, 2024))


# 날짜가 모두 있어도 명시된 개최 일수와 맞지 않으면 원본 일수만 보존한다.
def test_discontinuous_or_inconsistent_days(xlsx: Callable) -> None:
    path = xlsx(
        [
            ["시도명", "축제명", "시작일", "종료일", "총일수"],
            ["서울", "서울문화의 밤", datetime(2025, 5, 1), datetime(2025, 5, 31), 5],
        ]
    )
    record = parse_workbook(path, 2025)[0]
    assert record["start_date"] is record["end_date"] is None
    assert record["days"] == 5
    assert dates("5.1~5.31(5일간)", 2025) == (None, None, 5)


# 초기 양식의 병합 개최기간 아래 별도 일수도 불일치 검사에 포함한다.
def test_legacy_duration_column(xlsx: Callable) -> None:
    path = xlsx(
        [
            ["시도명", "축제명", "개최기간", None, "축제예산"],
            ["서울", "서울문화의 밤", "8.11~8.13", "(2일간)", "1억원"],
        ],
        ("C1:D1",),
    )
    record = parse_workbook(path, 2017)[0]
    assert record["start_date"] is record["end_date"] is None
    assert record["days"] == 2
    assert record["budget_krw"] == 100_000_000


# 조직명과 섞인 연락 정보는 행사 표에 남기지 않는다.
def test_host_removes_contact_suffix() -> None:
    assert host_name("서울시 문화예술과\n담당자 성명 비공개") == "서울시 문화예술과"
    assert host_name("서울시 / 서울문화재단\n(연락처 비공개)") == "서울시 / 서울문화재단"
