"""구체적인 위험 활동과 단어 일부가 겹치는 무관한 행사명을 구별한다."""

from pathlib import Path

import pytest
from crowdcast.data.events import make_event
from event_fixtures import gazetteer_fixture, mcst_row


# 각 위험 조건의 명시 표현은 잡고 수상·불교·지명 등의 부분 문자열은 제외한다.
@pytest.mark.parametrize(("positive", "negative", "hazard"), [
    ("서울세계불꽃축제", "불꽃문학상 수상작 전시", "폭죽"),
    ("정월대보름 달집태우기", "불교문화축제와 언양불고기축제", "불"),
    ("설악산 등산대회", "설악산 문화제", "산"),
    ("한강 수상레저", "문학상 수상작 전시", "수면"),
    ("한강 수상스키", "대상 수상 기념공연", "수면"),
    ("한강 수상체험", "수상자 축하공연", "수면"),
    ("한강 수상공연", "수상 경력 전시", "수면"),
    ("한강 수상무대", "국제영화제 수상작 상영", "수면"),
    ("가연성가스 체험", "가스산업 전시", "가연성가스"),
    ("석유류 전시", "석유산업 전시", "석유류"),
    ("차량 진입 행사장", "차량 전시", "차량진입"),
    ("단일 출입구 행사장", "출입구 안내", "단일출입구"),
    ("무대 밀집 행사장", "무대 공연", "무대밀집"),
    ("야간 조명 부족 행사장", "야간 조명 전시", "야간조명부족"),
])
def test_explicit_hazard_terms(tmp_path: Path, positive: str, negative: str, hazard: str) -> None:
    gazetteer = gazetteer_fixture(tmp_path)
    assert hazard in make_event(mcst_row(festival_name=positive), gazetteer)["hazard_flags"]
    assert make_event(mcst_row(festival_name=negative), gazetteer)["hazard_flags"] == []
