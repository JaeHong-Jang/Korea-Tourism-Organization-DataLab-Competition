"""도전 모델의 작은 실제 PyMC 적합과 격리된 발행 실행을 위한 합성 자료를 제공한다."""

import hashlib
import json
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.labels.g0 import build_g0
from crowdcast.models.__main__ import execute
from crowdcast.models.challenger.config import ChallengerConfig
from crowdcast.models.challenger.fit import fit
from crowdcast.models.challenger.posterior import Posterior


# 학습은 작은 연천 합성 표본으로 줄이고 시도·유형 계층은 두 종류씩 둔다.
@pytest.fixture
def small_training(model_data: tuple) -> tuple[pl.DataFrame, dict]:
    frame, events = model_data
    frame = frame.filter(pl.col("year") == 2022).with_columns(
        (pl.int_range(pl.len()) % 2).cast(pl.Float64).alias("type"),
    )
    events = {
        key: {**event, "sido": "경기도" if i % 2 else "강원특별자치도"}
        for i, (key, event) in enumerate(events.items())
    }
    return frame, events


# 추론의 정확도 성적이 아니라 실행·저장·재현성 검사에 필요한 짧은 실제 적합을 사용한다.
@pytest.fixture
def posterior(small_training: tuple, config: dict) -> Posterior:
    frame, events = small_training
    return fit(
        frame,
        ["region_daily_mean", "previous_daily_mean"],
        events,
        config,
        ChallengerConfig(draws=64, iterations=80),
    )


# 원본·모델·보고서·포인터를 임시 루트에 격리해 실제 기본 예보 바이트도 비교할 수 있게 한다.
@pytest.fixture
def published_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, model_data: tuple, config: dict) -> dict:
    monkeypatch.setattr(paths, "DATA_ROOT", tmp_path)
    for name, relative in (("PROCESSED", "data/processed"), ("MODELS", "models"), ("REPORTS", "reports")):
        directory = tmp_path / relative
        directory.mkdir(parents=True)
        monkeypatch.setattr(paths, name, directory)
    frame, events = model_data
    labels = frame.drop("type", "region_daily_mean", "previous_daily_mean", "as_of").with_columns(
        pl.lit(True).alias("is_primary"),
        pl.lit(True).alias("usable_for_training"),
        pl.lit("ok").alias("quality_flag"),
    )
    events = [
        {**event, "sido": "경기도", "sigungu_code": "41800", "source": ["문체부"]}
        for event in events.values()
    ]
    labels.write_parquet(paths.PROCESSED / "labels.parquet")
    pl.DataFrame(events).write_parquet(paths.PROCESSED / "events.parquet")
    pl.DataFrame(
        [
            {
                "sigungu_code": "28110",
                "sigungu_name": "인천 중구",
                "date": date(2025, 8, 1) + timedelta(days=i),
                "tou_div": group,
                "visitors": value + i,
                "available_at": date(2025, 8, 2) + timedelta(days=i),
                "continuity_break": False,
            }
            for i in range(90)
            for group, value in (("현지인", 100.0), ("외지인", 200.0), ("외국인", 30.0))
        ]
    ).write_parquet(paths.PROCESSED / "region_daily.parquet")
    qc = {
        "labels_sha256": hashlib.sha256((paths.PROCESSED / "labels.parquet").read_bytes()).hexdigest(),
        "g0": build_g0(labels, events),
    }
    (paths.PROCESSED / "labels_g0.json").write_text(json.dumps(qc))
    config_path = tmp_path / "model.yaml"
    config_path.write_text(json.dumps(config))
    result = execute(config_path)
    pointer = {"modelVersion": result["modelVersion"], "runId": result["runId"], "verdict": "미검증"}
    (paths.REPORTS / "backtest/promoted.json").write_text(json.dumps(pointer))
    return result
