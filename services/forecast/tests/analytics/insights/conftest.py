"""국내 행사와 완전한 지역 방문 격자로 인사이트 계산을 격리한다."""

from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.analytics.insights.records import Inputs


# 실제 자료·캐시·산출물에 쓰지 못하게 테스트마다 임시 루트를 사용한다.
@pytest.fixture(autouse=True)
def insight_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(paths, "PROCESSED", tmp_path / "processed")
    monkeypatch.setattr(paths, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(paths, "DATA", tmp_path / "data")
    paths.PROCESSED.mkdir()
    return tmp_path


# 규모·유형이 다른 행사들의 사후 지역 관측과 사전 평시를 만든다.
@pytest.fixture
def inputs() -> Inputs:
    events, labels, observations, forecasts = [], [], [], []
    for index, (name, code, kind, sido) in enumerate(
        [
            ("연천구석기축제", "41800", "전통", "경기도"),
            ("보령머드축제", "44180", "먹거리", "충청남도"),
            ("진주남강유등축제", "48170", "공연", "경상남도"),
        ]
    ):
        event_id, start, end = f"e-{code}-2025", date(2025, 7, 5), date(2025, 7, 6)
        events.append(
            {
                "event_id": event_id,
                "name": name,
                "sigungu_code": code,
                "type": kind,
                "sido": sido,
                "year": 2025,
                "start": start,
                "end": end,
                "hazard_flags": [],
                "visitors_announced": [0, 10000, None][index],
                "planned_month": None,
                "visitors_announced_meaning": "방문객수(前년) / 전체",
            }
        )
        labels.append(
            {
                "event_id": event_id,
                "label_tier": "goldA",
                "daily_mean": 5000.0,
                "definition": "일평균",
                "time_unit": "일",
                "spatial_scope": "행사장",
                "kind": "사후 집계",
                "is_primary": True,
                "days": 2,
                "year": 2025,
                "available_at": date(2025, 8, 10),
            }
        )
        forecasts.append(
            {
                "id": f"f-{code}-2025",
                "eventId": event_id,
                "judgment": {"level": 4},
                "dailyMean": {"p50": 10000.0},
                "peakConcurrent": {"p50": 6000.0},
                "evidence": [],
            }
        )
        for offset in range(128):
            current = date(2025, 3, 1) + timedelta(days=offset)
            during = start <= current <= end
            for group, amount in (("현지인", 100), ("외지인", 300 if during else 100), ("외국인", 100)):
                observations.append(
                    {
                        "sigungu_code": code,
                        "date": current,
                        "tou_div": group,
                        "visitors": float(amount * 10**index),
                        "available_at": current + timedelta(days=35),
                        "continuity_break": False,
                        "source_hash": "synthetic",
                    }
                )
    return Inputs(
        "2026-09-25T12:00:00+09:00",
        events=pl.DataFrame(events),
        labels=pl.DataFrame(labels),
        plans=pl.DataFrame(events),
        region=pl.DataFrame(observations),
        forecasts=forecasts,
        confirmed=dict.fromkeys(("events", "plans", "labels", "region"), "2026-09-24"),
    )
