"""학습 유형·규모 표본 수와 피처 범위로 분포 밖 입력을 표시한다."""

from typing import Any

import polars as pl
from crowdcast.features.event_features import CATEGORIES
from crowdcast.models.baselines import event_type, size_band


# 범위와 계층 표본 수는 학습 자료만으로 고정한다.
def fit_ood(frame: pl.DataFrame, names: list[str]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for row in frame.to_dicts():
        group = event_type(row) + ":" + size_band(row["daily_mean"])
        counts[group] = counts.get(group, 0) + 1
    return {"counts": counts, "ranges": {name: [frame[name].min(), frame[name].max()] for name in names}}


# 예측 중앙값으로 규모대를 찾고 평가 정답은 OOD 판정에 전달하지 않는다.
def detect_ood(row: dict[str, Any], p50: float, fitted: dict[str, Any]) -> dict[str, Any]:
    group = event_type(row) + ":" + size_band(p50)
    count = fitted["counts"].get(group, 0)
    outside = []
    for name, (low, high) in fitted["ranges"].items():
        value = row.get(name)
        # 미상 범주만 배운 피처도 전부 결측인 경우와 같으며 위험 요소의 0은 결측이 아니다.
        categories = CATEGORIES.get(name, [])
        if "미상" in categories and low == high == categories.index("미상"):
            continue
        # 학습에서 전부 결측인 피처는 배운 적 없어 반영되지 않을 뿐 외삽이 아니므로 범위 검사에서 뺀다.
        if value is not None and low is not None and (value < low or value > high):
            outside.append(name)
    return {
        "ood": count < 5 or bool(outside),
        "group": group,
        "training_n": count,
        "outside_features": outside,
    }
