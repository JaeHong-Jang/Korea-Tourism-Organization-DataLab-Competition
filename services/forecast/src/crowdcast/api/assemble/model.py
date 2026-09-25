"""사용 포인터의 불변 모델만 복원해 학습 때 정한 주 모델·보정·표시 방식을 재사용한다."""

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any

import lightgbm as lgb
import polars as pl
from crowdcast import paths
from crowdcast.api.assemble.artifacts import Unavailable, document, promoted, published_path
from crowdcast.models.baselines import SimpleModel
from crowdcast.models.calibrate import predict_calibrated
from crowdcast.models.explain import explain
from crowdcast.models.ood import detect_ood


# 단건 API 추론은 한 스레드만 써서 OpenMP 준비 비용과 동시 요청 과할당을 피한다.
class ForecastBooster(lgb.Booster):
    # 기존 보정·SHAP 함수는 그대로 호출하고 추론 실행 옵션만 고정한다.
    def predict(self, data: Any, **kwargs: Any) -> Any:
        return super().predict(data, **{**kwargs, "num_threads": 1})


# 모델 복원과 추론에 필요한 발행 파일을 하나의 버전으로 고정한다.
@dataclass
class PublishedModel:
    card: dict[str, Any]
    encoding: dict[str, Any]
    config: dict[str, Any]
    choice: dict[str, Any]
    ood: dict[str, Any]
    correction: dict[str, Any]
    simple: SimpleModel
    boosters: list[lgb.Booster]
    lock: Any = field(default_factory=Lock)

    # 같은 Booster에 대한 동시 호출을 직렬화하며 난수나 재학습을 추가하지 않는다.
    def infer(self, frame: pl.DataFrame) -> tuple[list[float], list[dict[str, Any]], dict[str, Any]]:
        with self.lock:
            if self.choice["primary_model"] == "simple":
                quantiles = self.simple.predict(frame)[0].tolist()
                factors = []
            else:
                quantiles = predict_calibrated(self.boosters, self.encoding, self.correction, frame)[
                    0
                ].tolist()
                factors = explain(self.boosters[1], frame, self.encoding)[0]
        return quantiles, factors, detect_ood(frame.row(0, named=True), quantiles[1], self.ood)


# 작은 포인터는 매 요청 확인하고 모델 파일은 버전별로 한 번만 읽는다.
def current_model() -> tuple[PublishedModel, dict[str, Any]]:
    pointer = promoted()
    folder = published_path(paths.MODELS, pointer["modelVersion"])
    try:
        model = load_model(folder)
    except FileNotFoundError:
        raise Unavailable("사용 모델 발행본이 완성되지 않았습니다") from None
    if model.card["backtestRunId"] != pointer["runId"]:
        raise ValueError("사용 모델과 백테스트 실행 불일치")
    return model, pointer


# 모델 카드와 인코딩 목록을 대조해 피처 순서가 바뀐 모델도 안전하게 복원한다.
@lru_cache(maxsize=3)
def load_model(folder: Path) -> PublishedModel:
    # 같은 발행 폴더의 JSON만 읽으며 공유 파일이나 후보 포인터로 우회하지 않는다.
    def read(name: str) -> dict[str, Any]:
        return json.loads((folder / f"{name}.json").read_text(encoding="utf-8"))

    card = document("model-card", folder.name)
    encoding, choice, manifest = read("features"), read("g0"), read("run")
    if encoding["features"] != card["features"] or len(set(card["features"])) != len(card["features"]):
        raise ValueError("모델 카드와 피처 순서 불일치")
    if choice["primary_model"] not in {"simple", "lightgbm"} or choice["basis"] not in {"구간", "확률"}:
        raise ValueError("사용 모델 선택 오류")
    if manifest["model_version"] != folder.name or manifest["run_id"] != card["backtestRunId"]:
        raise ValueError("발행 메타데이터 버전 불일치")
    boosters = [ForecastBooster(model_file=str(folder / f"p{alpha}.txt")) for alpha in (10, 50, 90)]
    if any(booster.feature_name() != encoding["features"] for booster in boosters):
        raise ValueError("모델 본체와 피처 순서 불일치")
    return PublishedModel(
        card,
        encoding,
        manifest["config"],
        choice,
        read("ood"),
        read("calibration"),
        SimpleModel.load(folder / "simple.json"),
        boosters,
    )
