"""파일명 날짜의 경계·미상·출처별 일정과 외부 관측 보존을 검증한다."""

from datetime import date, timedelta

import polars as pl
import pytest
from crowdcast.features.availability import Feature
from crowdcast.features.build import build_features, filename_sensitivity

# 날짜 가정은 운영 설정과 같은 세 연도에만 둔다.
DATES = {2018: "2018-06-05", 2019: "2019-02-27", 2025: "2025-03-21"}


# 파일명 날짜 당일은 허용하고 전날·미상 연도·사후 문서 연도는 모든 행사 피처를 가린다.
@pytest.mark.parametrize(
    ("cutoff", "masked"),
    [
        (date.fromisoformat(day) + timedelta(days=offset), offset < 0)
        for day in DATES.values()
        for offset in (-1, 0, 1)
    ]
    + [(date(year, 6, 1), True) for year in (2017, 2020, 2021, 2022, 2023, 2024, 2026)],
)
def test_filename_date_boundary(cutoff: date, masked: bool, monkeypatch: pytest.MonkeyPatch) -> None:
    event = {
        "event_id": f"e-yeoncheon-{cutoff.year}",
        "name": "연천구석기축제",
        "start": cutoff + timedelta(days=14),
        "end": cutoff + timedelta(days=16),
        "year": cutoff.year,
        "type": "전통",
        "time_of_day": "주간",
        "fee": "무료",
        "host_type": "지자체",
        "edition": 32,
        "budget_krw": 1000000,
        "hazard_flags": [],
        "source": ["문체부"],
        "date_source": "문체부",
    }
    # 외부 피처는 동일한 D-14 공개 값을 주어 민감도에서도 값·공개일이 보존되는지 확인한다.
    monkeypatch.setattr(
        "crowdcast.features.build.history_features",
        lambda *args: {"previous_daily_mean": Feature(45000, cutoff)},
    )
    conditional, names = build_features([event], [], pl.DataFrame(), {event["event_id"]})
    before = conditional.to_dicts()
    row = filename_sensitivity(conditional, names, {event["event_id"]: event}, DATES).row(0, named=True)
    assert row["event_attributes_masked"] is masked
    assert row["schedule_attributes_masked"] is masked
    assert row["event_attributes_available_at"] == (
        date.fromisoformat(DATES[cutoff.year]) if cutoff.year in DATES else None
    )
    assert conditional.to_dicts() == before
    for name in names:
        if before[0][f"{name}_is_observation"]:
            assert row[name] == before[0][name]
            assert row[f"{name}_available_at"] == before[0][f"{name}_available_at"]
        else:
            assert row[name] == (None if masked else before[0][name])


# TourAPI로 보강한 일정은 문체부 파일명 날짜가 아닌 그 일정의 공개 시각을 따른다.
@pytest.mark.parametrize("days_after", [0, 1])
def test_tourapi_schedule_date(days_after: int) -> None:
    cutoff = date(2025, 4, 19)
    event = {
        "event_id": "e-yeoncheon-2025",
        "name": "연천구석기축제",
        "type": "전통",
        "start": date(2025, 5, 3),
        "end": date(2025, 5, 5),
        "source": ["문체부", "TourAPI"],
        "date_source": "TourAPI",
        "date_available_at": cutoff + timedelta(days=days_after),
    }
    frame, names = build_features([event], [], pl.DataFrame(), {event["event_id"]})
    result = filename_sensitivity(frame, names, {event["event_id"]: event}, DATES)
    assert result["type"][0] == 5
    assert result["duration"][0] == (None if days_after else 3)
    assert result["duration_available_at"][0] == event["date_available_at"]


# 출처 불명 행사에 문체부 연도 날짜를 추정해 붙이지 않는다.
def test_unknown_source_has_no_assumed_date() -> None:
    event = {
        "event_id": "e-yeoncheon-2025",
        "name": "연천구석기축제",
        "type": "전통",
        "start": date(2025, 5, 3),
        "end": date(2025, 5, 5),
    }
    frame, names = build_features([event], [], pl.DataFrame(), {event["event_id"]})
    result = filename_sensitivity(frame, names, {event["event_id"]: event}, DATES)
    assert result["type"][0] is None
    assert result["event_attributes_available_at"][0] is None
