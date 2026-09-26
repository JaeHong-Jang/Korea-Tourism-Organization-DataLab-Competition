"""동명 지명·옛 시도명·부모 시·2025 경계 중심과 점 포함을 검증한다."""

from pathlib import Path

import polars as pl
import pytest
from crowdcast.data.admin_dict import lookup_admin, normalize_sido, resolve_admin
from event_fixtures import gazetteer_fixture


# 시도가 없는 동명 구·군을 첫 후보 하나로 축약하지 않는다.
@pytest.mark.parametrize(("name", "count"), [("중구", 6), ("동구", 6), ("고성군", 2)])
def test_ambiguous_names(tmp_path: Path, name: str, count: int) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    assert len(gazetteer.candidates(name)) == count
    assert resolve_admin(name, None, gazetteer.admin) == (None, "ambiguous")


# 옛 시도명과 부모 시 및 부분 이름이 섞이지 않는다.
@pytest.mark.parametrize(
    ("name", "sido", "code", "match"),
    [
        ("고성군", "강원도", "51820", "exact"),
        ("고성군", "경남", "48820", "exact"),
        ("전주시", "전라북도", "52110", "parent"),
        ("수원시", "경기", "41110", "parent"),
        ("인천 중구", None, "28110", "alias"),
        ("남구", "인천", "28177", "alias"),
        ("수원시 장안구", "경기도", "41111", "exact"),
        ("남양주시", "경기도", "41360", "exact"),
        ("달서구", "대구", "27290", "exact"),
        ("군위군", "경상북도", "27720", "exact"),
        ("본청", "세종", "36110", "alias"),
        ("광주시", "경기도", "41610", "exact"),
    ],
)
def test_region_resolution(tmp_path: Path, name: str, sido: str, code: str, match: str) -> None:
    region, method = resolve_admin(name, sido, gazetteer_fixture(tmp_path).admin)
    assert (region["sigungu_code"], method) == (code, match)


# 경계 없는 부모는 자식 구 합집합의 중심이며 API의 2026 코드는 사전에 들어오지 않는다.
def test_parent_geometry_and_old_sido(tmp_path: Path) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    parent = gazetteer.regions["41110"]
    assert parent["lat"] == pytest.approx(37.28)
    assert parent["lng"] == pytest.approx(127.01)
    assert gazetteer.covers("41110", 37.27, 127.01)
    assert not gazetteer.covers("41111", 37.27, 127.01)
    assert gazetteer.locate(37.27, 127.01) == ["41115"]
    assert gazetteer.locate(float("nan"), 127.01) == []
    assert normalize_sido("강원도") == "강원특별자치도"
    assert normalize_sido("전라북도") == "전북특별자치도"
    assert normalize_sido("서울특별시중구") == "서울특별시"
    assert len(lookup_admin("서울특별시중구", None, gazetteer.admin)) == 1


# 여러 장소의 행정구역은 합쳐서 모호성을 유지하고 흔한 시설명은 추론하지 않는다.
def test_venue_evidence(tmp_path: Path) -> None:
    raw = pl.from_dicts(
        [
            {"sido": "경기도", "sigungu_name": "수원시", "venue": "수원화성 일원"},
            {"sido": "서울특별시", "sigungu_name": "중구", "venue": "남산골한옥마을 일원"},
            {"sido": "서울특별시", "sigungu_name": "중구", "venue": "문화예술회관"},
        ]
    )
    gazetteer = gazetteer_fixture(tmp_path, raw)
    assert gazetteer.candidates("수원 화성", "경기")[0]["sigunguCode"] == "41110"
    assert gazetteer.candidates("문화예술회관", "서울") == []
    assert len(gazetteer.candidates("종로구, 중구", "서울")) == 2
