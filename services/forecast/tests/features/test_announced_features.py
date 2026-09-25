"""전년 발표치의 결측·공개일 민감도·정확한 행사 연결을 검증한다."""

import math
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast.features.announced import announced_scale_daily, with_announced
from crowdcast.features.build import build_features, filename_sensitivity
from crowdcast.features.event_features import event_features


# 발표치가 없으면 로그도 결측이고 0은 원본 입력 그대로 보존한다.
@pytest.mark.parametrize("value", [None, 0, 900, 35000])
def test_missing_and_log_announced(value: float | None) -> None:
    features = event_features({"visitors_announced": value})
    assert features["visitors_announced"].value == value
    assert features["log_visitors_announced"].value == (None if value is None else math.log1p(value))
    for name in ("visitors_announced", "log_visitors_announced"):
        assert features[name].available_at is None
        assert not features[name].is_observation


# 잘못된 발표치를 결측이나 0으로 바꿔 학습하지 않는다.
@pytest.mark.parametrize("value", [-1, math.inf, math.nan])
def test_invalid_announced(value: float) -> None:
    with pytest.raises(ValueError, match="visitors_announced"):
        event_features({"visitors_announced": value})


# 조건부 입력과 파일명 공개일 민감도는 경계 당일·미상 연도를 구분한다.
@pytest.mark.parametrize(
    "year,offset,masked",
    [(2020, 0, True), (2024, 0, True), (2025, -1, True), (2025, 0, False), (2026, 0, True)],
)
def test_announced_publication_boundary(year: int, offset: int, masked: bool, tmp_path: Path) -> None:
    cutoff = date(year, 3, 21) + timedelta(days=offset)
    event = {
        "event_id": f"e-yeoncheon-{year}",
        "name": "연천구석기축제",
        "year": year,
        "start": cutoff + timedelta(days=14),
        "end": cutoff + timedelta(days=16),
        "source": ["문체부"],
        "visitors_announced": 35000,
    }
    frame, names = build_features(
        [event], [], pl.DataFrame(), {event["event_id"]}, audit_path=tmp_path / "availability.json"
    )
    sensitive = filename_sensitivity(frame, names, {event["event_id"]: event}, {2025: "2025-03-21"})
    for name in ("visitors_announced", "log_visitors_announced"):
        assert frame[name][0] is not None
        assert frame[f"{name}_available_at"][0] is None
        assert sensitive[name][0] == (None if masked else frame[name][0])
        assert sensitive[f"{name}_available_at"][0] is None
    daily = announced_scale_daily(frame.row(0, named=True))
    assert daily == 35000 / 3
    assert announced_scale_daily(sensitive.row(0, named=True)) == (None if masked else daily)


# 파일명 가림을 통과해도 명시된 실제 공개일이 늦으면 발표치 계층은 쓰지 않는다.
def test_sensitivity_preserves_late_publication(tmp_path: Path) -> None:
    event = {
        "event_id": "e-yeoncheon-2025",
        "name": "연천구석기축제",
        "year": 2025,
        "start": date(2025, 5, 2),
        "end": date(2025, 5, 5),
        "source": ["문체부"],
        "visitors_announced": 35000,
        "visitors_announced_available_at": date(2025, 4, 19),
    }
    frame, names = build_features(
        [event], [], pl.DataFrame(), {event["event_id"]}, audit_path=tmp_path / "availability.json"
    )
    sensitive = filename_sensitivity(frame, names, {event["event_id"]: event}, {2025: "2025-03-21"})
    row = sensitive.row(0, named=True)
    assert row["visitors_announced"] == 35000
    assert row["visitors_announced_available_at"] == date(2025, 4, 19)
    assert announced_scale_daily(row) is None


# 실제 공개 시각을 받은 경우에만 그 날짜를 보존하며 임의로 D-14를 붙이지 않는다.
def test_explicit_plan_publication() -> None:
    features = event_features(
        {
            "visitors_announced": 900,
            "visitors_announced_available_at": "2025-03-20T16:00:00+00:00",
        }
    )
    assert features["visitors_announced"].available_at == date(2025, 3, 21)
    assert features["log_visitors_announced"].available_at == date(2025, 3, 21)


# 마스터 값은 정확히 같은 회차에서만 가져오며 행사 입력의 일정·요금은 덮지 않는다.
def test_attach_only_same_event() -> None:
    event = {"event_id": "e-yeoncheon-2026", "sigungu_code": "41800", "start": date(2026, 5, 3)}
    master = {**event, "visitors_announced": 900, "budget_krw": 999999}
    attached = with_announced(event, [master])
    assert attached["visitors_announced"] == 900
    assert "budget_krw" not in attached and "visitors_announced" not in event
    for masters in (
        [],
        [master, master],
        [{**master, "event_id": "e-yeoncheon-2025"}],
        [{**master, "sigungu_code": "41820"}],
        [{**master, "start": date(2025, 5, 3)}],
    ):
        assert with_announced(event, masters) == event
