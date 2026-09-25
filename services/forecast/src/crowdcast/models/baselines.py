"""학습 구간 중앙값·공개된 전회차·단위 일치 사전 예상과 단순 모델을 제공한다."""

import json
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
from crowdcast.features.announced import published_announced_daily
from crowdcast.features.availability import publication_date


# 규모 구간은 정답 대신 전회차·보정한 발표치·학습 유형 중앙값으로 선택한다.
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
    def __init__(self, *, announced_scale: bool = False) -> None:
        self.type_medians: dict[str, float] = {}
        self.weighted_type_medians: dict[str, float] = {}
        self.groups: dict[str, list[list[float]]] = {}
        self.residuals: dict[str, list[list[float]]] = {}
        self.global_median = 0.0
        self.announced_ratio: float | None = None
        self.announced_pairs: dict[str, int] = {}
        # 기존 발행본은 계층 선택만 사용하고 새 학습에서만 발표치 중앙값을 켠다.
        self.announced_scale = announced_scale
        self.announced_residuals: list[list[float]] = []

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
        self.announced_pairs.clear()
        self.announced_residuals.clear()
        # 전년 누적 발표치를 입력 기간으로 나눈 규모 대용치와 정답의 비율을 학습 표본에서만 맞춘다.
        ratios = []
        for row in rows:
            daily = published_announced_daily(row) if self.announced_scale else announced_daily(row)
            if daily is not None and daily > 0 and row["daily_mean"] > 0:
                ratios.append([daily / row["daily_mean"], weight(row)])
                tier = row.get("label_tier", "미상")
                self.announced_pairs[tier] = self.announced_pairs.get(tier, 0) + 1
        self.announced_ratio = float(weighted_quantile(ratios, 0.5)) if ratios else None

        # 발표치 계층의 폭은 유형 잔차가 아닌 학습 발표치↔라벨 로그 잔차로 고정한다.
        if self.announced_scale:
            for row in rows:
                scale = self.announced_center(row)
                if scale is not None:
                    residual = float(np.log1p(row["daily_mean"]) - np.log1p(scale))
                    self.announced_residuals.append([residual, weight(row)])

        # 유형 중앙값과 규모 계층은 보정·평가 정답을 보지 않고 같은 학습 표본으로 고정한다.
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
        model = cls(announced_scale=state.get("announced_scale", False))
        model.type_medians = state["type_medians"]
        model.weighted_type_medians = state["weighted_type_medians"]
        model.groups = state["groups"]
        model.residuals = state["residuals"]
        model.global_median = state["global_median"]
        # v1 발행본에는 발표 보정이 없으므로 기존 유형 중앙값 동작을 유지한다.
        model.announced_ratio = state.get("announced_ratio")
        model.announced_pairs = state.get("announced_pairs", {})
        model.announced_residuals = state.get("announced_residuals", [])
        return model

    # 전회차 골드를 우선하고 발표치·학습 보정 쌍이 없으면 기존 유형 중앙값으로 돌아간다.
    def group(self, row: dict[str, Any]) -> str:
        prior = row.get("previous_daily_mean")
        if prior is None and self.announced_ratio is not None:
            daily = published_announced_daily(row) if self.announced_scale else announced_daily(row)
            if daily is not None:
                prior = daily / self.announced_ratio
        fallback = self.weighted_type_medians.get(event_type(row), self.global_median)
        return event_type(row) + ":" + size_band(prior if prior is not None else fallback)

    # B0는 무가중 학습 유형 중앙값만 쓰며 학습에 없는 유형은 비교 불가로 남긴다.
    def b0(self, row: dict[str, Any]) -> float | None:
        return self.type_medians.get(event_type(row))

    # T-203b 비율은 발표/라벨이므로 역수를 곱해 일평균 규모를 보정한다.
    def announced_center(self, row: dict[str, Any]) -> float | None:
        if not self.announced_scale or self.announced_ratio is None:
            return None
        daily = published_announced_daily(row)
        return daily / self.announced_ratio if daily is not None else None

    # 실제 선택한 계층을 백테스트·다가오는 행사 집계에서 동일하게 센다.
    def scale_source(self, row: dict[str, Any]) -> str:
        if row.get("previous_daily_mean") is not None:
            return "previous"
        return "announced" if self.announced_center(row) is not None else "type"

    # 공개된 직전 실측이 있으면 발표치와 유형 중앙값보다 우선한다.
    def center(self, row: dict[str, Any]) -> float:
        if row.get("previous_daily_mean") is not None:
            return float(row["previous_daily_mean"])
        if self.announced_scale:
            scale = self.announced_center(row)
            return (
                scale
                if scale is not None
                else self.weighted_type_medians.get(event_type(row), self.global_median)
            )
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
            if self.scale_source(row) == "announced":
                residuals = self.announced_residuals
            low, high = weighted_quantile(residuals, [0.1, 0.9])
            center = np.log1p(self.center(row))
            predictions.append(np.expm1(np.maximum(0, [center + min(0, low), center, center + max(0, high)])))
        return np.asarray(predictions)


# 누적 발표치를 일평균 실측으로 간주하지 않고 입력 기간으로 나눈 규모 대용치만 만든다.
def announced_daily(row: dict[str, Any]) -> float | None:
    announced, duration = row.get("visitors_announced"), row.get("duration")
    if announced is None or duration is None:
        return None
    if not np.isfinite(announced) or announced < 0 or not np.isfinite(duration) or duration <= 0:
        raise ValueError("발표 방문객수·행사 기간 오류")
    return float(announced / duration)


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
