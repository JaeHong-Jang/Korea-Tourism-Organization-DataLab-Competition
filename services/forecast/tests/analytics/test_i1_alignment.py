"""기간·단위 환산이 집계 조건 검증이나 입장권 변환으로 오인되지 않는지 확인한다."""

from crowdcast.analytics.insights.i1_alignment import comparison_basis


# 실제 설악문화제 사례의 누적 발표값과 보고서 일평균을 구성한다.
def sample():
    return {
        "start": "2024-10-04",
        "end": "2024-10-06",
        "announced": {"value": 101012, "unit": "명", "label": "개최계획 기재값"},
        "observed": {"value": 25839, "unit": "명/일", "label": "보고서 추정"},
    }, {"from": "2024-10-04", "to": "2024-10-06", "scope": "구역 미공개"}


# 단위를 맞춰도 비교 확정 비율을 생성하지 않고 원자료를 보존한다.
def test_same_schedule_normalizes_without_claiming_comparability():
    row, report = sample()
    result = comparison_basis(row, report)
    assert result["announcedDaily"]["value"] == 33670.67
    assert result["observedDaily"]["value"] == 25839
    assert result["days"] == 3
    assert result["ratio"] is None
    assert result["status"] == "schedule_daily"
    assert row["announced"]["value"] == 101012


# 센서 분석 기간이 행사 등록 기간과 다르면 같은 일수로 나누지 않는다.
def test_mismatched_period_is_not_divided_by_event_duration():
    row, report = sample()
    report["to"] = "2024-10-13"
    result = comparison_basis(row, report)
    assert result["announcedDaily"] is None
    assert result["note"] == "행사·관측 기간 다름"


# 발권 수나 기간 누적인원이 확인되지 않은 관측을 일평균 인원으로 바꾸지 않는다.
def test_ticket_and_unknown_counting_basis_stay_original():
    row, report = sample()
    row["announced"]["unit"] = "매"
    assert comparison_basis(row, report)["announcedDaily"] is None
    row["announced"]["unit"] = "명"
    row["observed"]["unit"] = "명"
    assert comparison_basis(row, report)["announcedDaily"] is None
    assert comparison_basis(row)["announcedDaily"] is None


# 실제 영값을 보존하며 없는 수치를 환산으로 채우지 않는다.
def test_zero_and_missing_values():
    row, report = sample()
    row["announced"]["value"] = 0
    assert comparison_basis(row, report)["announcedDaily"]["value"] == 0
    row["observed"] = None
    assert comparison_basis(row, report) is None
