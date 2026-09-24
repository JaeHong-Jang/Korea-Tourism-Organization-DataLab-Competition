"""학습 구간 중앙값·공개된 전회차·단위 일치 사전 예상과 단순 모델을 제공한다."""

import json
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
from crowdcast.features.availability import publication_date


# 규모 구간은 정답을 모르는 예측 시점에는 전회차 또는 학습 유형 중앙값으로 선택한다.
def size_band(value: float) -> str:
    return "<1000" if value < 1000 else "1000~5000" if value <= 5000 else ">5000"


# 예보 입력의 유형을 고정 인코딩으로 읽고 실제 결측만 별도 계층으로 묶는다.
def event_type(row: dict[str, Any]) -> str:
    return "미상" if row.get("type") is None else str(int(row["type"]))


# 가중 분위수(누적 가중치의 가운데 위치 사이를 선형 보간) — 가중치가 모두 같으면 중앙값은 np.median과 같다.
def weighted_quantile(pairs: list[list[float]], q: float | list[float]) -> Any:
    values = np.asarray([value for value, _ in pairs], dtype=float)
    weights = np.asarray([weight for _, weight in pairs], dtype=float)
    order = np.argsort(values, kind="stable")
    values, weights = values[order], weights[order]
    positions = (np.cumsum(weights) - weights / 2) / weights.sum()
    return np.interp(q, positions, values)


# 기준선 B0와 단순 모델의 계층·잔차는 fit에 전달한 학습 자료에서만 계산한다.
class SimpleModel:
    # 중앙값과 (값, 가중치) 쌍을 직렬화 가능한 숫자·목록으로 보관한다.
    def __init__(self) -> None:
        self.type_medians: dict[str, float] = {}
        self.weighted_type_medians: dict[str, float] = {}
        self.groups: dict[str, list[list[float]]] = {}
        self.residuals: dict[str, list[list[float]]] = {}
        self.global_median = 0.0

    # 실버는 보조 정답이라 가중치를 낮춘다(06 §2 — LightGBM과 같은 설정). B0 유형 중앙값만 무가중이다.
    def fit(self, frame: pl.DataFrame, weights: dict[str, float] | None = None) -> "SimpleModel":
        rows = frame.to_dicts()
        if not rows:
            raise ValueError("단순 모델 학습 표본이 없습니다")
        weights = weights or {"gold": 1.0, "silver": 1.0}

        # 라벨 등급 열이 없는 자료(기준선 단위 테스트 등)는 모두 골드 가중치로 본다.
        def weight(row: dict[str, Any]) -> float:
            return weights["silver"] if row.get("label_tier") == "silver" else weights["gold"]

        self.type_medians.clear()
        self.weighted_type_medians.clear()
        self.groups.clear()
        self.residuals.clear()
        self.global_median = float(weighted_quantile([[r["daily_mean"], weight(r)] for r in rows], 0.5))
        for kind in sorted({event_type(row) for row in rows}):
            same = [row for row in rows if event_type(row) == kind]
            self.type_medians[kind] = float(np.median([row["daily_mean"] for row in same]))
            self.weighted_type_medians[kind] = float(
                weighted_quantile([[row["daily_mean"], weight(row)] for row in same], 0.5)
            )
        for row in rows:
            self.groups.setdefault(self.group(row), []).append([row["daily_mean"], weight(row)])
        for row in rows:
            residual = float(np.log1p(row["daily_mean"]) - np.log1p(self.center(row)))
            for key in (self.group(row), event_type(row), "전체"):
                self.residuals.setdefault(key, []).append([residual, weight(row)])
        return self

    # 저장한 학습 계층과 잔차만 복원하고 평가 자료로 다시 집계하지 않는다.
    @classmethod
    def load(cls, path: Path) -> "SimpleModel":
        state = json.loads(path.read_text(encoding="utf-8"))
        model = cls()
        model.type_medians = state["type_medians"]
        model.weighted_type_medians = state["weighted_type_medians"]
        model.groups = state["groups"]
        model.residuals = state["residuals"]
        model.global_median = state["global_median"]
        return model

    # 이력 없는 신규 행사의 규모는 학습 유형 가중 중앙값에서만 결정한다.
    def group(self, row: dict[str, Any]) -> str:
        prior = row.get("previous_daily_mean")
        fallback = self.weighted_type_medians.get(event_type(row), self.global_median)
        return event_type(row) + ":" + size_band(prior if prior is not None else fallback)

    # B0는 무가중 학습 유형 중앙값만 쓰며 학습에 없는 유형은 비교 불가로 남긴다.
    def b0(self, row: dict[str, Any]) -> float | None:
        return self.type_medians.get(event_type(row))

    # 공개된 직전 실측이 있으면 계층 가중 중앙값보다 우선한다.
    def center(self, row: dict[str, Any]) -> float:
        if row.get("previous_daily_mean") is not None:
            return float(row["previous_daily_mean"])
        group = self.groups.get(self.group(row))
        if group:
            return float(weighted_quantile(group, 0.5))
        return self.weighted_type_medians.get(event_type(row), self.global_median)

    # 중앙값을 포함하는 구간에 같은 계층의 학습 로그 잔차 가중 분위수를 적용한다.
    def predict(self, frame: pl.DataFrame) -> np.ndarray:
        predictions = []
        for row in frame.to_dicts():
            residuals = self.residuals.get(
                self.group(row), self.residuals.get(event_type(row), self.residuals["전체"])
            )
            low, high = weighted_quantile(residuals, [0.1, 0.9])
            center = np.log1p(self.center(row))
            predictions.append(np.expm1(np.maximum(0, [center + min(0, low), center, center + max(0, high)])))
        return np.asarray(predictions)


# B2는 사후 발표·누적 인원·공간 범위 불일치·미공개 수치를 모두 제외한다.
def host_expected(event: dict[str, Any], row: dict[str, Any]) -> float | None:
    quantity = event.get("expectedByHost")
    if not quantity:
        return None
    available = publication_date(quantity.get("announcedAt"))
    value = quantity.get("value")
    if (
        quantity.get("unit") != "명/일"
        or quantity.get("timeUnit") != "일"
        or quantity.get("spatialScope") != row["spatial_scope"]
        or quantity.get("valueKind") != "사전예상"
        or available is None
        or available > row["as_of"]
        or value is None
        or not np.isfinite(value)
        or value < 0
    ):
        return None
    return float(value)
