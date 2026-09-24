"""LightGBM TreeSHAP의 상위 기여도를 근거 연결 전 요인 구조로 만든다."""

import hashlib
from typing import Any

import lightgbm as lgb
import numpy as np
import polars as pl
from crowdcast.models.train import matrix

# 수치 없는 고정 문구만 쓰며 T-204가 근거를 붙이기 전에는 발행하지 않는다.
LABELS = {
    "type": "행사 유형에 따른 방문 규모",
    "time_of_day": "행사 시간대에 따른 방문 규모",
    "fee": "입장 요금에 따른 방문 규모",
    "host_type": "주최 유형에 따른 방문 규모",
    "edition": "행사 회차에 따른 방문 규모",
    "log_budget": "행사 예산에 따른 방문 규모",
    "duration": "개최 기간에 따른 방문 규모",
    "weekend_days": "주말 일정에 따른 방문 규모",
    "month": "개최 시기에 따른 방문 규모",
    "holiday_days": "공휴일 일정에 따른 방문 규모",
    "holiday_streak": "연휴 길이에 따른 방문 규모",
    "previous_daily_mean": "전회차 실측 방문 규모",
    "region_daily_mean": "개최지의 평시 방문 규모",
    "nonlocal_share": "개최지의 외지인 비중",
    "weekend_ratio": "개최지의 주말 방문 변화",
}


# LightGBM의 내장 TreeSHAP은 중앙값 모델의 로그 예측에 대한 기여도다.
def explain(
    model: lgb.LGBMRegressor | lgb.Booster,
    frame: pl.DataFrame,
    encoding: dict[str, Any],
) -> list[list[dict[str, Any]]]:
    booster = model if isinstance(model, lgb.Booster) else model.booster_
    contributions = np.asarray(booster.predict(matrix(frame, encoding), pred_contrib=True))[:, :-1]
    output = []
    for event_id, values in zip(frame["event_id"], contributions, strict=True):
        factors = []
        for index in np.argsort(-np.abs(values), kind="stable")[:5]:
            name = encoding["features"][index]
            identifier = hashlib.sha256(f"{event_id}:{name}".encode()).hexdigest()[:20]
            factors.append(
                {
                    "id": f"fa-{identifier}",
                    "feature": name,
                    "direction": "up" if values[index] >= 0 else "down",
                    "contribution": float(values[index]),
                    "label": LABELS.get(name, "행사 위험 요소에 따른 방문 규모"),
                    "evidenceIds": [],
                }
            )
        output.append(factors)
    return output
