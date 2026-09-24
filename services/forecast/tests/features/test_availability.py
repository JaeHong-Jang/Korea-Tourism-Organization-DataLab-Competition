"""공개 시점 경계·행사 결측·이력 선택·지역 집계의 누수 방지를 검증한다."""

import json
import math
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast.features.availability import Feature, check_availability
from crowdcast.features.build import build_features
from crowdcast.features.history_features import history_features
from crowdcast.features.region_features import prepare_regions, region_features


# 실제 축제 이름을 사용한 합성 입력의 공개일은 개최 한 달 전으로 고정한다.
def festival(year: int = 2025) -> dict:
    return {
        "event_id": f"e-yeoncheon-{year}",
        "name": "연천구석기축제",
        "start": date(year, 5, 3),
        "end": date(year, 5, 5),
        "type": "전통",
        "time_of_day": "주간",
        "fee": "유료",
        "host_type": "지자체",
        "edition": 32,
        "budget_krw": None,
        "hazard_flags": [],
        "sigungu_code": "41800",
        "available_at": date(year, 4, 1),
        "is_golden": False,
    }


# 경계 당일은 허용하되 하루 뒤나 공개일 미상 값은 즉시 실패한다.
def test_availability_boundary() -> None:
    cutoff = date(2025, 4, 19)
    check_availability({"budget": Feature(100, cutoff)}, cutoff)
    for day in (cutoff + timedelta(days=1), None):
        with pytest.raises(ValueError, match="공개 시점 위반"):
            check_availability({"budget": Feature(100, day)}, cutoff)


# 선택된 외부 관측의 사후 공개 값을 주입하면 게이트와 실패 연계 파일에 잡힌다.
def test_builder_rejects_future_value(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    event = festival()
    monkeypatch.setattr(
        "crowdcast.features.build.history_features",
        lambda *args: {"previous_daily_mean": Feature(45000, date(2025, 4, 20))},
    )
    audit = tmp_path / "audit.json"
    with pytest.raises(ValueError, match="previous_daily_mean"):
        build_features([event], [], pl.DataFrame(), {event["event_id"]}, audit_path=audit)
    assert json.loads(audit.read_text())["violations"] == 1
    assert json.loads(audit.read_text())["checked"] == 1


# 행사 입력은 공개일이 없거나 D-14 뒤여도 수치와 범주를 그대로 보존한다.
@pytest.mark.parametrize("available", [None, date(2025, 5, 3)])
def test_event_inputs_do_not_require_publication(available: date | None) -> None:
    event = festival()
    event.update(available_at=available, date_available_at=available, budget_krw=100000000)
    event["feature_available_at"] = {"budget_krw": available}
    frame, _ = build_features([event], [], pl.DataFrame(), {event["event_id"]})
    assert frame["as_of"][0] == date(2025, 4, 19)
    expected = {
        "type": 5,
        "time_of_day": 0,
        "fee": 1,
        "host_type": 0,
        "edition": 32,
        "log_budget": math.log1p(100000000),
        "hazard_fireworks": 0,
        "duration": 3,
        "weekend_days": 2,
        "month": 5,
    }
    for name, value in expected.items():
        assert frame[name][0] == value
        assert frame[f"{name}_available_at"][0] is None
        assert frame[f"{name}_is_observation"][0] is False
    assert frame["previous_daily_mean"][0] is None
    assert frame["region_daily_mean"][0] is None


# 행사 입력에 포함된 달력은 외부 관측 공개일 검사와 구분한다.
def test_calendar_and_publication_boundary() -> None:
    event = festival()
    event["holiday_calendar"] = {"available_at": date(2025, 4, 19), "dates": ["2025-05-05"]}
    frame, _ = build_features([event], [], pl.DataFrame(), {event["event_id"]})
    assert frame["duration"][0] == 3
    assert frame["weekend_days"][0] == 2
    assert frame["holiday_days"][0] == 1
    assert frame["holiday_streak"][0] == 3
    assert frame["holiday_days_available_at"][0] is None
    assert frame["holiday_days_is_observation"][0] is False


# 성공 연계 파일은 직전 위반 건수를 지우고 이번에 검사한 관측 수를 남긴다.
def test_availability_audit_overwrites_previous(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    event = festival()
    cutoff = date(2025, 4, 19)
    audit = tmp_path / "audit.json"
    audit.write_text('{"checked": 99, "violations": 1}')
    monkeypatch.setattr(
        "crowdcast.features.build.history_features",
        lambda *args: {"previous_daily_mean": Feature(45000, cutoff)},
    )
    build_features([event], [], pl.DataFrame(), {event["event_id"]}, audit_path=audit)
    result = json.loads(audit.read_text())
    assert result["checked"] == 1 and result["violations"] == 0
    assert "외부 관측" in result["asOfRule"] and "14" in result["asOfRule"]


# 직전 회차의 사후 라벨은 D-14까지 공개된 경우에만 피처가 된다.
def test_previous_label_publication_and_golden() -> None:
    event, prior = festival(), festival(2024)
    cutoff = date(2025, 4, 19)
    label = {
        "is_primary": True,
        "usable_for_training": True,
        "is_golden": False,
        "label_tier": "goldA",
        "daily_mean": 45000.0,
        "available_at": cutoff,
    }
    rows = {prior["event_id"]: label}
    assert history_features(event, cutoff, [event, prior], rows)["previous_daily_mean"].value == 45000
    label["available_at"] = cutoff + timedelta(days=1)
    assert history_features(event, cutoff, [event, prior], rows)["previous_daily_mean"].value is None
    label.update(available_at=cutoff, is_golden=True)
    assert history_features(event, cutoff, [event, prior], rows)["previous_daily_mean"].value is None


# 이름의 회차·연도·공백 변화는 연결하되 같은 일정의 복수 후보를 임의로 고르지 않는다.
def test_previous_edition_name_and_ambiguity() -> None:
    event, prior = festival(), festival(2024)
    event["name"] = "2025 제32회 연천 구석기 축제"
    prior["name"] = "제31회 연천구석기축제"
    cutoff = date(2025, 4, 19)
    label = {
        "is_primary": True,
        "usable_for_training": True,
        "is_golden": False,
        "label_tier": "goldA",
        "daily_mean": 45000.0,
        "available_at": cutoff,
    }
    labels = {prior["event_id"]: label}
    assert history_features(event, cutoff, [event, prior], labels)["previous_daily_mean"].value == 45000.0
    duplicate = {**prior, "event_id": "e-yeoncheon-ambiguous"}
    assert (
        history_features(event, cutoff, [event, prior, duplicate], labels)["previous_daily_mean"].value
        is None
    )
    different = {**prior, "name": "연천 구석기 겨울여행"}
    assert history_features(event, cutoff, [event, different], labels)["previous_daily_mean"].value is None


# 미공개·연속성 끊김·다른 지역·불완전 집단은 평시 집계에 들어가지 않는다.
def test_region_window_and_publication() -> None:
    cutoff = date(2025, 4, 19)
    rows = []
    for day, available, count in (
        (date(2025, 4, 4), cutoff, 100.0),
        (date(2025, 4, 5), cutoff, 200.0),
        (date(2025, 4, 6), cutoff + timedelta(days=1), 10000.0),
    ):
        for group in ("현지인", "외지인", "외국인"):
            rows.append(
                {
                    "sigungu_code": "41800",
                    "date": day,
                    "available_at": available,
                    "visitors": count,
                    "tou_div": group,
                    "continuity_break": False,
                }
            )
    regions = prepare_regions(pl.DataFrame(rows))
    result = region_features("41800", cutoff, regions)
    assert result["region_daily_mean"] == Feature(450.0, cutoff)
    assert result["nonlocal_share"].value == pytest.approx(1 / 3)
    assert result["weekend_ratio"].value == 2
    assert region_features("41800", cutoff, regions, continuity_break=True)["region_daily_mean"].value is None
