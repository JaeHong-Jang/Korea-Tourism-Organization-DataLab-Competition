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


# 기준선 B0와 단순 모델의 계층·잔차는 fit에 전달한 학습 자료에서만 계산한다.
class SimpleModel:
    # 중앙값과 잔차를 직렬화 가능한 숫자·목록으로 보관한다.
    def __init__(self) -> None:
        self.type_medians: dict[str, float] = {}
        self.groups: dict[str, list[float]] = {}
        self.residuals: dict[str, list[float]] = {}
        self.global_median = 0.0

    # 동일 계층 표본이 없으면 유형·전체 순으로 물러나는 계층 중앙값을 학습한다.
    def fit(self, frame: pl.DataFrame) -> "SimpleModel":
        rows = frame.to_dicts()
        if not rows:
            raise ValueError("단순 모델 학습 표본이 없습니다")
        self.type_medians.clear()
        self.groups.clear()
        self.residuals.clear()
        self.global_median = float(np.median(frame["daily_mean"].to_numpy()))
        for kind in sorted({event_type(row) for row in rows}):
            self.type_medians[kind] = float(
                np.median([row["daily_mean"] for row in rows if event_type(row) == kind])
            )
        for row in rows:
            key = self.group(row)
            self.groups.setdefault(key, []).append(row["daily_mean"])
        for row in rows:
            residual = float(np.log1p(row["daily_mean"]) - np.log1p(self.center(row)))
            for key in (self.group(row), event_type(row), "전체"):
                self.residuals.setdefault(key, []).append(residual)
        return self

    # 저장한 학습 계층과 잔차만 복원하고 평가 자료로 다시 집계하지 않는다.
    @classmethod
    def load(cls, path: Path) -> "SimpleModel":
        state = json.loads(path.read_text(encoding="utf-8"))
        model = cls()
        model.type_medians = state["type_medians"]
        model.groups = state["groups"]
        model.residuals = state["residuals"]
        model.global_median = state["global_median"]
        return model

    # 이력 없는 신규 행사의 규모는 학습 유형 중앙값에서만 결정한다.
    def group(self, row: dict[str, Any]) -> str:
        prior = row.get("previous_daily_mean")
        proxy = prior if prior is not None else self.type_medians.get(event_type(row), self.global_median)
        return event_type(row) + ":" + size_band(proxy)

    # B0는 학습 유형 중앙값만 쓰며 학습에 없는 유형은 비교 불가로 남긴다.
    def b0(self, row: dict[str, Any]) -> float | None:
        return self.type_medians.get(event_type(row))

    # 공개된 직전 실측이 있으면 계층 중앙값보다 우선한다.
    def center(self, row: dict[str, Any]) -> float:
        if row.get("previous_daily_mean") is not None:
            return float(row["previous_daily_mean"])
        group = self.groups.get(self.group(row))
        return (
            float(np.median(group)) if group else self.type_medians.get(event_type(row), self.global_median)
        )

    # 중앙값을 포함하는 구간에 같은 계층의 학습 로그 잔차 분위수를 적용한다.
    def predict(self, frame: pl.DataFrame) -> np.ndarray:
        predictions = []
        for row in frame.to_dicts():
            residuals = self.residuals.get(
                self.group(row), self.residuals.get(event_type(row), self.residuals["전체"])
            )
            low, high = np.quantile(residuals, [0.1, 0.9])
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
