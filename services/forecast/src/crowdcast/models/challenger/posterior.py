"""분위수에 필요한 사후 표본만 저장하고 Student-t 혼합 예측분포를 결정적으로 계산한다."""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
from crowdcast.models.challenger.encoding import group_values, matrix
from scipy.optimize import brentq
from scipy.stats import t


# 체인 전체 추적이나 학습 행별 잠재값 대신 새 행사 예측에 필요한 계수만 보관한다.
@dataclass
class Posterior:
    encoding: dict[str, Any]
    samples: dict[str, np.ndarray]
    metadata: dict[str, Any]

    # 사후 표본은 정렬된 JSON으로 저장해 같은 시드 재실행의 바이트 비교를 가능하게 한다.
    def save(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        value = {
            "encoding": self.encoding,
            "metadata": self.metadata,
            "samples": {name: values.tolist() for name, values in self.samples.items()},
        }
        (directory / "posterior.json").write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False) + "\n",
            encoding="utf-8",
        )

    # 복원에는 PyMC가 필요 없으며 직렬화 전후 같은 계수로 예측한다.
    @classmethod
    def load(cls, directory: Path) -> "Posterior":
        value = json.loads((directory / "posterior.json").read_text(encoding="utf-8"))
        return cls(
            value["encoding"], {k: np.asarray(v) for k, v in value["samples"].items()}, value["metadata"]
        )

    # 새로운 유형·시도는 영 효과로 고정하지 않고 해당 계층의 사후 예측 불확실성을 적분한다.
    def group_effect(self, name: str, value: str) -> np.ndarray:
        groups = self.encoding["groups"][name]
        if value in groups:
            return self.samples[f"{name}_effect"][:, groups.index(value)]
        key = f"{self.metadata['config']['seed']}:{name}:{value}".encode()
        seed = int.from_bytes(hashlib.sha256(key).digest()[:8], "little")
        return (
            np.random.default_rng(seed).normal(size=len(self.samples["intercept"]))
            * self.samples[f"{name}_scale"]
        )

    # 잔차 표본을 다시 뽑지 않고 혼합 CDF를 역산하므로 배치 순서·호출 횟수에 독립적이다.
    def predict(self, frame: pl.DataFrame, events: dict[str, dict[str, Any]]) -> np.ndarray:
        x = matrix(frame, self.encoding)
        groups = group_values(frame, events)
        sigma, nu = self.samples["sigma"], self.samples["nu"]
        values = []
        for index in range(frame.height):
            mu = self.samples["intercept"] + self.samples["beta"] @ x[index]
            for name in ("type", "sido"):
                mu = mu + self.group_effect(name, groups[name][index])
            low = float(np.min(mu + sigma * t.ppf(0.001, nu)))
            high = float(np.max(mu + sigma * t.ppf(0.999, nu)))
            logs = [
                brentq(lambda z, q=q, mu=mu: float(t.cdf((z - mu) / sigma, nu).mean()) - q, low, high)
                for q in (0.1, 0.5, 0.9)
            ]
            with np.errstate(over="raise", invalid="raise"):
                values.append(np.exp(logs))
        result = np.asarray(values).reshape((-1, 3))
        if not np.isfinite(result).all() or np.any(result <= 0):
            raise ValueError("도전 모델 예측이 유한한 양수가 아닙니다")
        return result
