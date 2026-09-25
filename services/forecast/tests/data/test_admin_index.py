"""행정명 검색 캐시가 프레임 수명·변경·반환 행의 독립성을 보존하는지 검증한다."""

import gc
import weakref

import polars as pl
import pytest
from crowdcast.data import admin_dict
from crowdcast.data.admin_dict import lookup_admin
from legacy_admin_lookup import lookup_admin as legacy_lookup_admin


# 공간 확장 없이 동명 지역과 중첩 목록·도형 반환을 검증할 작은 사전을 만든다.
@pytest.fixture
def admin() -> pl.DataFrame:
    return pl.from_dicts([
        {"sigungu_code": "11140", "sido": "서울특별시", "aliases": ["중구"],
         "parent_code": None, "geometry_wkb": b"seoul", "source": ["boundary"]},
        {"sigungu_code": "28110", "sido": "인천광역시", "aliases": ["중구"],
         "parent_code": None, "geometry_wkb": b"incheon", "source": ["boundary"]},
    ])


# 행 전체를 다시 변환하지 않으면서 호출자가 고친 중첩 목록은 다음 결과와 분리한다.
def test_reuses_rows_without_exposing_cache(admin: pl.DataFrame, monkeypatch: pytest.MonkeyPatch) -> None:
    expected = legacy_lookup_admin("중구", None, admin)
    result = lookup_admin("중구", None, admin)
    assert result == expected
    result[0]["aliases"].clear()
    result[0]["source"].append("visitors")
    result[0]["geometry_wkb"] = b"changed"

    # 두 번째 조회에서 행 변환이나 별칭 컴파일을 반복하면 실패한다.
    def repeated_preparation(*args: object, **kwargs: object) -> None:
        raise AssertionError("행정 사전의 행·패턴을 다시 준비함")

    monkeypatch.setattr(pl.DataFrame, "to_dicts", repeated_preparation)
    monkeypatch.setattr(admin_dict.re, "compile", repeated_preparation)
    assert lookup_admin("중구", None, admin) == expected
    assert lookup_admin("인천 중구", None, admin) == expected[1:]


# 서로 다른 프레임과 원본을 수정한 프레임의 행·별칭이 캐시에서 뒤섞이지 않는다.
def test_frame_identity_and_in_place_changes(admin: pl.DataFrame) -> None:
    lookup_admin("중구", None, admin)
    other = admin.reverse()
    assert lookup_admin("중구", None, other) == legacy_lookup_admin("중구", None, other)
    admin.replace_column(admin.get_column_index("aliases"), pl.Series("aliases", [["종로구"], ["중구"]]))
    assert lookup_admin("중구", None, admin) == legacy_lookup_admin("중구", None, admin)
    assert lookup_admin("종로구", None, admin) == legacy_lookup_admin("종로구", None, admin)
    admin.replace_column(admin.get_column_index("geometry_wkb"), pl.Series("geometry_wkb", [b"new", b""]))
    assert lookup_admin("종로구", None, admin) == legacy_lookup_admin("종로구", None, admin)


# 스냅샷·행 변환 직후 원본이 바뀌어도 캐시 행과 스냅샷은 같은 내용을 보존한다.
@pytest.mark.parametrize("preparation", ["clone", "to_dicts"])
def test_cache_rows_come_from_snapshot(
    admin: pl.DataFrame, monkeypatch: pytest.MonkeyPatch, preparation: str
) -> None:
    expected = legacy_lookup_admin("중구", None, admin)
    prepare = getattr(pl.DataFrame, preparation)
    changed = False

    # 선택한 준비 단계 직후 한 번만 원본을 바꿔 잠금·스레드 없이 변경 시점을 제어한다.
    def prepare_then_change_original(frame: pl.DataFrame) -> pl.DataFrame | list[dict]:
        nonlocal changed
        prepared = prepare(frame)
        if not changed:
            changed = True
            admin.replace_column(
                admin.get_column_index("aliases"), pl.Series("aliases", [["종로구"], ["중구"]])
            )
            admin.replace_column(
                admin.get_column_index("geometry_wkb"), pl.Series("geometry_wkb", [b"new", b"incheon"])
            )
        return prepared

    # 현재 조회는 스냅샷의 행·패턴을 함께 사용하고 변경된 원본은 섞지 않는다.
    monkeypatch.setattr(pl.DataFrame, preparation, prepare_then_change_original)
    assert lookup_admin("중구", None, admin) == expected
    cached = admin_dict._ADMIN_INDEXES[id(admin)]
    assert not cached.snapshot.equals(admin)
    assert [row for row, _ in cached.rows] == cached.snapshot.to_dicts() == expected

    # 다음 조회에서는 원본 변경을 감지해 새 별칭·도형으로 캐시를 다시 만든다.
    assert lookup_admin("중구", None, admin) == expected[1:]
    updated = lookup_admin("종로구", None, admin)
    assert updated == legacy_lookup_admin("종로구", None, admin)
    assert updated[0]["aliases"] == ["종로구"]
    assert updated[0]["geometry_wkb"] == b"new"
    assert admin_dict._ADMIN_INDEXES[id(admin)].snapshot.equals(admin)


# 사용이 끝난 프레임의 캐시가 도형과 행 목록을 계속 붙잡지 않는다.
def test_cache_releases_discarded_frame(admin: pl.DataFrame) -> None:
    frame = admin.clone()
    identity, reference = id(frame), weakref.ref(frame)
    lookup_admin("중구", None, frame)
    assert identity in admin_dict._ADMIN_INDEXES
    del frame
    gc.collect()
    assert reference() is None
    assert identity not in admin_dict._ADMIN_INDEXES
