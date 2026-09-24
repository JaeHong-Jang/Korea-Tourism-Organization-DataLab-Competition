"""실제 행정명·코드와 단순 시험 다각형으로 행사 테스트 입력을 만든다."""

import json
from pathlib import Path

import polars as pl
from crowdcast.data.admin_dict import SIDO_CODES, build_admin
from crowdcast.data.geocode import Gazetteer

# 다각형은 공간 연산의 시험용 사각형이며 실제 행정 경계를 대신하지 않는다.
REGIONS = {
    "11140": "중구",
    "26110": "중구",
    "27110": "중구",
    "28110": "중구",
    "30140": "중구",
    "31110": "중구",
    "26170": "동구",
    "27140": "동구",
    "28140": "동구",
    "29110": "동구",
    "30110": "동구",
    "31170": "동구",
    "51820": "고성군",
    "48820": "고성군",
    "41111": "수원시 장안구",
    "41115": "수원시 팔달구",
    "52111": "전주시 완산구",
    "52113": "전주시 덕진구",
    "28177": "미추홀구",
    "28260": "서구",
    "41360": "남양주시",
    "41630": "양주시",
    "41610": "광주시",
    "27720": "군위군",
    "36110": "세종특별자치시",
    "50110": "제주시",
    "50130": "서귀포시",
    "11110": "종로구",
    "27290": "달서구",
    "27170": "서구",
}


# 공간 포함 검증에 쓸 수원 두 구와 나머지 시험 사각형을 TopoJSON으로 직렬화한다.
def gazetteer_fixture(tmp_path: Path, festivals: pl.DataFrame | None = None) -> Gazetteer:
    arcs, geometries = [], []
    for index, (code, name) in enumerate(REGIONS.items()):
        x, y = 126 + index * 0.1, 35.0
        if code in {"41111", "41115"}:
            x, y = 127.0, 37.28 if code == "41111" else 37.26
        arcs.append([[x, y], [x + 0.02, y], [x + 0.02, y + 0.02], [x, y + 0.02], [x, y]])
        geometries.append(
            {
                "type": "Polygon",
                "arcs": [[index]],
                "properties": {"sgg": code, "name": name, "sidonm": SIDO_CODES[code[:2]]},
            }
        )
    path = tmp_path / "sigungu.topo.json"
    path.write_text(
        json.dumps(
            {
                "type": "Topology",
                "arcs": arcs,
                "objects": {"sigungu": {"type": "GeometryCollection", "geometries": geometries}},
            }
        )
    )
    regions = pl.from_dicts(
        [
            {"sigungu_code": code, "sigungu_name": name, "code_system": 2025}
            for code, name in {**REGIONS, "41110": "수원시", "52110": "전주시"}.items()
        ]
    )
    return Gazetteer(build_admin(regions, path), festivals)


# 수원 개최계획 예시는 날짜가 미정인 원문과 발표 방문객 정의를 함께 갖는다.
def mcst_row(**changes: object) -> dict:
    return {
        "festival_name": "제63회 수원화성문화제",
        "year": 2026,
        "sido": "경기도",
        "sigungu_name": "수원시",
        "venue": "수원화성",
        "type": "전통",
        "date_text": "10월 예정",
        "planned_month": 10,
        "visitors_announced": 10000,
        "visitors_announced_meaning": "2025년 기간 누적(천명)",
        "source_file": "2026_개최계획.xlsx",
        "source_sheet": "경기",
        "source_row": 3,
        **changes,
    }


# 일정은 경계조건 검사용 합성값이며 외부에 확정 일정으로 발행하지 않는다.
def tour_item(**changes: object) -> dict:
    return {
        "contentid": "506224",
        "title": "2026 수원화성문화제",
        "addr1": "경기도 수원시 팔달구 수원화성",
        "mapx": "127.01",
        "mapy": "37.27",
        "eventstartdate": "20261009",
        "eventenddate": "20261011",
        "available_at": "2026-09-25T00:00:00+00:00",
        "source_hash": "a" * 64,
        **changes,
    }
