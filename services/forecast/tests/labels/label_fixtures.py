"""실제 한국 축제와 손으로 계산 가능한 일별 방문자 픽스처를 제공한다."""

import csv
import io
from datetime import date
from pathlib import Path
from typing import Any

import polars as pl

FIXTURES = Path(__file__).parent / "fixtures"


# 연천 축제 원문 이름과 2025년 일정을 기본으로 사용한다.
def festival(**changes: Any) -> dict[str, Any]:
    row = {
        "event_id": "e-2025-41800-연천",
        "name": "제32회 연천 구석기 축제",
        "year": 2025,
        "sido": "경기도",
        "type": "전통",
        "sigungu_code": "41800",
        "start": date(2025, 5, 2),
        "end": date(2025, 5, 5),
        "continuity_break": False,
        "sigungu_match": "exact",
    }
    return {**row, **changes}


# 세 구분 합계가 주어진 총원이 되게 만들어 기준선 계산을 독립적으로 검산한다.
def visitors(values: dict[date, float], code: str = "41800") -> pl.DataFrame:
    rows = [
        {
            "sigungu_code": code,
            "date": day,
            "tou_div": category,
            "visitors": float(total * share),
            "continuity_break": False,
        }
        for day, total in values.items()
        for category, share in (("현지인", 0.25), ("외지인", 0.5), ("외국인", 0.25))
    ]
    return pl.DataFrame(
        rows,
        schema={
            "sigungu_code": pl.String,
            "date": pl.Date,
            "tou_div": pl.String,
            "visitors": pl.Float64,
            "continuity_break": pl.Boolean,
        },
    )


# 주석·쉼표·줄바꿈이 들어 있는 DIY 원문을 CSV 규칙으로 안전하게 기록한다.
def write_csv(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    path.write_bytes(buffer.getvalue().encode("utf-8-sig"))


# 열 순서와 숫자 원문이 유지되는지를 확인할 수 있도록 작은 대상 목록을 만든다.
def diy_targets(path: Path) -> list[str]:
    row = {
        "priority": "1",
        "festival_name": "연천구석기축제",
        "year": "2025",
        "sido": "경기",
        "days": "4",
        "why": "연천 행사 원문, 그대로 보존",
    }
    fields = list(row)
    write_csv(path, fields, [row])
    return fields


# 실제 연천 CSV의 BOM과 열 이름을 바꾸지 않고 테스트 데이터 폴더로 옮긴다.
def gold_files(data: Path) -> Path:
    folder = data / "20260924192829_문화관광축제_2018-2025_데이터랩_다운로드"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "20260924192829_연천구석기축제_연도별 방문자 추이.csv"
    target.write_bytes((FIXTURES / "연천구석기축제_연도별 방문자 추이.csv").read_bytes())
    companion = target.with_name("20260924192829_연천구석기축제_목적지 검색순위.csv")
    write_csv(
        companion,
        ["구분", "순위", "읍면동명", "목적지명", "도로명주소", "카테고리"],
        [
            {
                "구분": "외지인",
                "순위": "1",
                "읍면동명": "전곡읍",
                "목적지명": "연천구석기축제",
                "도로명주소": "경기 연천군 양연로 1510-0",
                "카테고리": "기타문화관광지",
            }
        ],
    )
    return target
