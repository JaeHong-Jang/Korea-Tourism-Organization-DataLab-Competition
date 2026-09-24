"""모델 테스트에 네트워크 없는 연도별 축제 합성 표본을 제공한다."""

import socket
from datetime import date

import polars as pl
import pytest


# 모델 검증이 외부 데이터 호출을 숨겨 수행하지 못하게 한다.
@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    # 주소와 키를 출력하지 않고 접속 시도 자체를 실패시킨다.
    def deny(*args: object, **kwargs: object) -> None:
        raise AssertionError("모델 테스트 외부 호출 금지")

    monkeypatch.setattr(socket, "create_connection", deny)
    monkeypatch.setattr(socket.socket, "connect", deny)


# 학습·보정·평가 연도별로 충분한 행사를 생성해 전체 경로를 작게 실행한다.
@pytest.fixture
def model_data() -> tuple[pl.DataFrame, dict]:
    rows, events = [], {}
    for year in (2022, 2023, 2024, 2025):
        for index in range(24):
            event_id = f"e-yeoncheon-{year}-{index}"
            events[event_id] = {
                "event_id": event_id,
                "name": "연천구석기축제",
                "type": "전통",
                "start": date(year, 5, 3),
                "end": date(year, 5, 5),
                "hazard_flags": [],
            }
            rows.append(
                {
                    "event_id": event_id,
                    "year": year,
                    "label_tier": "silver" if index else "goldA",
                    "daily_mean": float(900 + 60 * index + (year - 2022) * 100),
                    "available_at": date(year, 8, 1),
                    "as_of": date(year, 4, 19),
                    "type": 5.0,
                    "region_daily_mean": float(5000 + index * 100),
                    "previous_daily_mean": float(850 + 60 * index) if index % 2 else None,
                    "spatial_scope": "행사장",
                    "time_unit": "일",
                    "is_golden": False,
                }
            )
    return pl.DataFrame(rows), events


# 테스트에서도 학습 하한·분할은 운영 규칙을 유지하고 트리 수만 줄인다.
@pytest.fixture
def config() -> dict:
    return {
        "seed": 2026,
        "samples": 200,
        "eval_years": [2024, 2025],
        "exclude_covid": True,
        "silver_weight": 0.5,
        "gold_weight": 1.0,
        "min_train_rows": 20,
        "min_calibration_rows": 10,
        "lightgbm": {"num_leaves": 7, "min_child_samples": 10, "n_estimators": 5, "learning_rate": 0.05},
    }


# G0 결정에는 성적과 독립적인 고유 행사 수만 쓴다.
@pytest.fixture
def label_qc() -> dict:
    return {
        "labels_sha256": "a" * 64,
        "g0": {
            "gold_summary": {
                "gold_event_count": 5,
                "peak_below_1000_count": 0,
                "peak_ge_1000_count": 5,
                "peak_missing_count": 0,
            },
            "gold_by_year": [{"year": year, "gold_event_count": 1} for year in (2024, 2025)],
        },
    }
