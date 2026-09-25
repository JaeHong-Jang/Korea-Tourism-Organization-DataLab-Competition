"""실제 전처리 자료 전체와 경계 사례에서 최적화 전후 행·장소·후보의 동등성을 검증한다."""

import json
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.data.admin_dict import lookup_admin, resolve_admin
from crowdcast.data.geocode import Gazetteer
from event_fixtures import gazetteer_fixture
from legacy_admin_lookup import LegacyGazetteer
from legacy_admin_lookup import lookup_admin as legacy_lookup_admin
from legacy_admin_lookup import resolve_admin as legacy_resolve_admin


# 도형 바이트는 손실 없는 16진수로 바꾸고 필드·후보 순서까지 비교한다.
def result_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, default=bytes.hex).encode("utf-8")


# 부모·동명·옛 이름·한글 경계·반복 지명·빈 입력을 실제 사전 없이도 대조한다.
def test_lookup_boundary_equivalence(tmp_path: Path) -> None:
    admin = gazetteer_fixture(tmp_path).admin
    cases = [
        (None, None), ("", "세종"), (" -- ", None), ("본청", "세종"),
        ("중구", None), ("동구", None), ("고성군", None), ("고성군", "강원도"),
        ("남구", "인천"), ("군위군", "경상북도"), ("전주시", "전라북도"),
        ("수원시 장안구", "경기"), ("수원시 팔달구, 장안구", None),
        ("남양주시", "경기도"), ("남양주시 및 양주시", "경기"),
        ("서울특별시중구", None), ("중구/종로구/중구", "서울"),
        ("광주시", "경기"), ("광주 시민공원", None), ("고성탈축제", None),
        ("고성(탈축제)", None), ("고성 고성군", None), ("수원 화성", "경기도"),
    ]
    for text, sido in cases:
        assert result_bytes(lookup_admin(text, sido, admin)) == result_bytes(
            legacy_lookup_admin(text, sido, admin)
        ), (text, sido)
        assert result_bytes(resolve_admin(text, sido, admin)) == result_bytes(
            legacy_resolve_admin(text, sido, admin)
        ), (text, sido)


# 실제 산출물이 없으면 건너뛰고, 있으면 모든 장소와 행정명 입력을 이전 구현에 대조한다.
def test_processed_gazetteer_equivalence() -> None:
    required = [paths.PROCESSED / f"{name}.parquet" for name in ("admin_dict", "mcst_festivals", "events")]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        pytest.skip("실제 전처리 자료 없음: " + ", ".join(missing))
    admin, festivals, events = (pl.read_parquet(path) for path in required)
    previous = LegacyGazetteer(admin, festivals)
    current = Gazetteer(admin, festivals)
    assert current.venues == previous.venues
    assert result_bytes(current.regions) == result_bytes(previous.regions)

    # 중복 입력은 한 번 비교하되 축제·행사 마스터의 모든 venue와 시도 조합을 포함한다.
    queries = pl.concat([festivals.select("venue", "sido"), events.select("venue", "sido")]).unique(
        maintain_order=True
    )
    for text, sido in queries.iter_rows():
        assert result_bytes(lookup_admin(text, sido, admin)) == result_bytes(
            legacy_lookup_admin(text, sido, admin)
        ), (text, sido)
        assert result_bytes(current.candidates(text or "", sido)) == result_bytes(
            previous.candidates(text or "", sido)
        ), (text, sido)

    # make_event가 사용하는 행정명 해석도 축제의 모든 조합에서 동일해야 한다.
    for text, sido in festivals.select("sigungu_name", "sido").unique().iter_rows():
        assert result_bytes(current.resolve(text, sido)) == result_bytes(previous.resolve(text, sido))
