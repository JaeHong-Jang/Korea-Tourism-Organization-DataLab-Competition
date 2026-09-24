"""해변 장소와 수면 활동을 구별하고 생태·자연 유형의 꽃 분류를 검증한다."""

from pathlib import Path

import pytest
from crowdcast.data.events import make_event
from event_fixtures import gazetteer_fixture, mcst_row


# 해수욕장이나 해변이라는 장소만으로 물 위 활동 위험을 붙이지 않는다.
@pytest.mark.parametrize(("name", "venue", "water"), [
    ("머드축제", "대천해수욕장", False), ("부산고등어축제", "송도해수욕장", False),
    ("보령 크리스마스축제", "대천해수욕장", False), ("보성차밭빛축제", "율포해수욕장", False),
    ("보령 물놀이 축제", "대천해변", False), ("해수욕 축제", "대천해수욕장", False),
    ("동강뗏목축제", "동강", True), ("춘천 카누 체험", "의암호", True),
    ("한강 카약 체험", "한강", True), ("한강 요트 체험", "한강", True),
    ("한강 보트 체험", "한강", True), ("충주 조정대회", "탄금호", True),
])
def test_water_activity_required(tmp_path: Path, name: str, venue: str, water: bool) -> None:
    row = make_event(mcst_row(festival_name=name, venue=venue), gazetteer_fixture(tmp_path))
    assert ("수면" in row["hazard_flags"]) is water


# 생태·자연은 행사명에 꽃·식물 경관이 명시된 경우만 꽃 유형으로 남긴다.
@pytest.mark.parametrize("raw_type", ["생태자연", "자연생태", "생태 자연", "02. 자연생태", "02.생태자연"])
@pytest.mark.parametrize(("name", "kind"), [
    ("고성공룡대축제", "기타"), ("칠갑산얼음분수고드름축제", "기타"),
    ("동강뗏목축제", "기타"), ("양구배꼽축제", "기타"),
    ("진해군항제", "기타"), ("고양국제꽃박람회", "꽃"), ("경주벚꽃축제", "꽃"),
    ("정선민둥산억새축제", "꽃"), ("순천갈대축제", "꽃"), ("내장산단풍축제", "꽃"),
    ("봉평메밀문화제", "꽃"), ("고창핑크뮬리축제", "꽃"), ("의성산수유축제", "꽃"),
])
def test_ecology_type_uses_name(tmp_path: Path, raw_type: str, name: str, kind: str) -> None:
    row = make_event(mcst_row(festival_name=name, type_raw=raw_type, type="꽃"), gazetteer_fixture(tmp_path))
    assert row["type"] == kind


# 다른 문체부 유형의 분류와 불꽃 행사의 기존 우선 규칙은 유지한다.
@pytest.mark.parametrize(("name", "raw_type", "kind", "expected"), [
    ("보성다향대축제", "지역특산물", "먹거리", "먹거리"),
    ("안동국제탈춤페스티벌", "문화예술", "공연", "공연"),
    ("수원화성문화제", "전통역사", "전통", "전통"),
    ("서울세계불꽃축제", "생태자연", "꽃", "불꽃"),
])
def test_other_type_mapping_unchanged(
    tmp_path: Path, name: str, raw_type: str, kind: str, expected: str,
) -> None:
    row = make_event(mcst_row(festival_name=name, type_raw=raw_type, type=kind), gazetteer_fixture(tmp_path))
    assert row["type"] == expected


# 꽃게·불꽃·꽃동네·눈꽃처럼 꽃이 식물을 뜻하지 않는 낱말은 꽃 근거로 세지 않는다.
@pytest.mark.parametrize(("name", "kind"), [
    ("연평 꽃게체험 걷기축제", "기타"), ("꽃동네 나눔축제", "기타"),
    ("강변 불꽃 빛축제", "기타"), ("꽃게와 벚꽃 축제", "꽃"),
    ("대관령눈꽃축제", "기타"), ("얼음꽃 겨울축제", "기타"), ("눈꽃과 벚꽃 축제", "꽃"),
])
def test_ecology_non_flower_words(tmp_path: Path, name: str, kind: str) -> None:
    raw = mcst_row(festival_name=name, type_raw="02. 자연생태", type="꽃")
    assert make_event(raw, gazetteer_fixture(tmp_path))["type"] == kind
