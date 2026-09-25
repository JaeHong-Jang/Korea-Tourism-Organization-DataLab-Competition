"""전년 발표치의 공통 입력 연결과 v1 바이트 보존·v2 실제 추론을 검증한다."""

import json
import math
from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.analytics.upcoming import run_batch
from crowdcast.api.assemble import inputs, model, observations
from crowdcast.api.assemble.identity import canonical
from crowdcast.data.events import contract_event
from crowdcast.models.baselines import SimpleModel
from crowdcast.models.ood import fit_ood
from crowdcast.models.train import fit_quantiles, save_quantiles
from fastapi.testclient import TestClient

ANNOUNCED = ("visitors_announced", "log_visitors_announced")


# 요청과 같은 영종 회차에만 전년 발표치와 원문 의미·공개일을 가진 마스터 행을 추가한다.
@pytest.fixture
def announced_event(region_data: pl.DataFrame, case_data: tuple, event: dict) -> dict:
    row = {
        **inputs.feature_event(event),
        "year": inputs.korean_date(event["startsAt"]).year,
        "sido": event["sido"], "sigungu_name": event["sigunguName"],
        "venue": event["venue"]["name"], "lat": event["venue"]["lat"], "lng": event["venue"]["lng"],
        "source": ["문체부"], "is_golden": False,
        "visitors_announced": 35000.0,
        "visitors_announced_meaning": "전년 누적 방문객",
        "visitors_announced_available_at": "2025-03-21",
    }
    existing = pl.read_parquet(paths.PROCESSED / "events.parquet")
    pl.concat([existing, pl.DataFrame([row])], how="diagonal_relaxed").write_parquet(
        paths.PROCESSED / "events.parquet"
    )
    return contract_event(row)


# v1은 발표치 없는 인코딩·저장 형식으로, v2는 발표치를 학습한 실제 직렬화 모델로 만든다.
@pytest.fixture
def announced_models(model_data: Path, announced_event: dict) -> Path:
    row = observations.feature_frame(announced_event, inputs.cutoff(announced_event), []).row(0, named=True)
    all_names = [key.removesuffix("_is_observation") for key in row if key.endswith("_is_observation")]
    config = {
        "seed": 2026, "samples": 4000, "silver_weight": 0.5, "gold_weight": 1.0,
        "lightgbm": {"n_estimators": 5, "num_leaves": 7, "min_child_samples": 10},
    }
    for version in ("v0.1.0", "v0.2.0"):
        names = [name for name in all_names if version == "v0.2.0" or name not in ANNOUNCED]
        rows = [
            {
                **{name: row[name] for name in names},
                "event_id": f"e-yeongjong-fireworks-{1980 + index}",
                "daily_mean": 400.0 + index * 500,
                "label_tier": "goldA",
                "previous_daily_mean": None,
                **({"visitors_announced": 2400.0 + index * 3000,
                    "log_visitors_announced": math.log1p(2400.0 + index * 3000)}
                   if version == "v0.2.0" else {}),
            }
            for index in range(40)
        ]
        frame = pl.DataFrame(rows, schema_overrides=dict.fromkeys(names, pl.Float64))
        fitted, encoding = fit_quantiles(frame, names, config)
        folder = paths.MODELS / version
        save_quantiles(folder, fitted, encoding)
        card = json.loads((folder / "model_card.json").read_text())
        simple = vars(SimpleModel().fit(frame))
        if version == "v0.1.0":
            simple = {key: value for key, value in simple.items() if not key.startswith("announced_")}
        documents = {
            "model_card": {**card, "features": names},
            "g0": {"primary_model": "lightgbm", "basis": "확률"},
            "run": {"config": config, "model_version": version, "run_id": f"bt-{version}"},
            "calibration": {"correction_log": 0.2}, "ood": fit_ood(frame, names), "simple": simple,
        }
        for name, value in documents.items():
            (folder / f"{name}.json").write_text(json.dumps(value))
    model.load_model.cache_clear()
    return model_data


# 격리된 테스트 발행본만 선택하고 운영 후보·사용 포인터는 건드리지 않는다.
def select_model(reports: Path, version: str, primary: str) -> None:
    (reports / "promoted.json").write_text(json.dumps({
        "modelVersion": version, "runId": f"bt-{version}", "verdict": "미검증",
    }))
    (paths.MODELS / version / "g0.json").write_text(json.dumps({
        "primary_model": primary, "basis": "확률",
    }))
    model.load_model.cache_clear()


# 동일 마스터·시계·v1에서 연결 전후 HTTP 본문과 일괄 JSONL·parquet의 모든 바이트를 비교한다.
@pytest.mark.parametrize("primary", ["simple", "lightgbm"])
def test_v1_announcement_connection_preserves_bytes(
    client: TestClient, announced_event: dict, announced_models: Path,
    monkeypatch: pytest.MonkeyPatch, primary: str,
) -> None:
    select_model(announced_models, "v0.1.0", primary)
    published, _ = model.current_model()
    assert not set(ANNOUNCED) & set(published.encoding["features"])
    assert published.simple.announced_ratio is None
    day = inputs.korean_date(announced_event["startsAt"])
    files = [paths.PROCESSED / name for name in ("upcoming_forecasts.jsonl", "upcoming.parquet")]

    # 연결 전 동작은 마스터 보충만 비활성화해 같은 모델·자료로 재현한다.
    with monkeypatch.context() as before:
        before.setattr(observations, "with_announced", lambda event, events: event)
        frame = observations.feature_frame(announced_event, inputs.cutoff(announced_event), [])
        assert frame["visitors_announced"][0] is None
        response_before = client.post("/v1/predict", json=announced_event)
        assert response_before.status_code == 200, response_before.text
        assert "예보 수: 1" in run_batch(day, day)
        batch_before = [path.read_bytes() for path in files]

    # 실제 연결은 값이 채워졌음을 별도로 확인해 무작동 구현이 회귀 검사를 통과하지 못하게 한다.
    frame = observations.feature_frame(announced_event, inputs.cutoff(announced_event), [])
    assert frame["visitors_announced"][0] == 35000
    response_after = client.post("/v1/predict", json=announced_event)
    assert response_after.status_code == 200, response_after.text
    assert response_after.content == response_before.content
    assert "예보 수: 1" in run_batch(day, day)
    assert [path.read_bytes() for path in files] == batch_before


# 후보 v2의 실제 추론 직전 값을 두 경로에서 확인하며 발표치를 관측 근거로 둔갑시키지 않는다.
@pytest.mark.parametrize("primary", ["simple", "lightgbm"])
def test_v2_receives_announced_in_predict_and_batch(
    client: TestClient, announced_event: dict, announced_models: Path,
    monkeypatch: pytest.MonkeyPatch, primary: str,
) -> None:
    select_model(announced_models, "v0.2.0", primary)
    published, _ = model.current_model()
    assert set(ANNOUNCED) <= set(published.encoding["features"])
    assert published.simple.announced_ratio is not None
    original = published.infer
    seen = []

    # 예측 결과는 대역하지 않고 입력 기록 뒤 실제 복원 모델을 실행한다.
    def record_infer(frame: pl.DataFrame) -> tuple:
        seen.append(frame.row(0, named=True))
        return original(frame)

    monkeypatch.setattr(published, "infer", record_infer)
    response = client.post("/v1/predict", json=announced_event)
    assert response.status_code == 200, response.text
    day = inputs.korean_date(announced_event["startsAt"])
    assert "예보 수: 1" in run_batch(day, day)
    assert len(seen) == 2
    for row in seen:
        assert row["visitors_announced"] == 35000
        assert row["log_visitors_announced"] == math.log1p(35000)
        for name in ANNOUNCED:
            assert row[f"{name}_available_at"] == date(2025, 3, 21)
            assert not row[f"{name}_is_observation"]
    stored = json.loads((paths.PROCESSED / "upcoming_forecasts.jsonl").read_bytes())
    assert canonical(stored["forecast"]).encode() == response.content
    assert response.json()["modelVersion"] == "v0.2.0"
    assert not set(ANNOUNCED) & {row["featureName"] for row in response.json()["observations"]}


# 직접 받은 0도 유효 발표치이며 공개일을 마스터의 다른 값과 섞지 않는다.
@pytest.mark.parametrize("value", [0.0, 900.0])
def test_feature_frame_preserves_explicit_announcement(announced_event: dict, value: float) -> None:
    supplied = {
        **announced_event, "visitors_announced": value,
        "visitors_announced_available_at": "2025-04-01",
    }
    frame = observations.feature_frame(supplied, inputs.cutoff(supplied), list(ANNOUNCED))
    assert frame["visitors_announced"][0] == value
    assert frame["log_visitors_announced"][0] == math.log1p(value)
    assert frame["visitors_announced_available_at"][0] == date(2025, 4, 1)


# ID·지역·개최연도가 다르거나 마스터 값 자체가 없으면 다른 회차의 발표치로 채우지 않는다.
@pytest.mark.parametrize("mismatch", ["id", "region", "year", "missing", "duplicate"])
def test_feature_frame_leaves_unmatched_announcement_missing(announced_event: dict, mismatch: str) -> None:
    event = dict(announced_event)
    if mismatch == "id":
        event["id"] = "e-yeongjong-fireworks-unregistered-2025"
    elif mismatch == "region":
        event["sigunguCode"] = "11110"
    elif mismatch == "year":
        event["startsAt"] = event["startsAt"].replace("2025", "2026")
        event["endsAt"] = event["endsAt"].replace("2025", "2026")
    else:
        path = paths.PROCESSED / "events.parquet"
        master = pl.read_parquet(path)
        if mismatch == "missing":
            master = master.with_columns(pl.lit(None, dtype=pl.Float64).alias("visitors_announced"))
        else:
            master = pl.concat([master, master.filter(pl.col("event_id") == event["id"])])
        master.write_parquet(path)
    frame = observations.feature_frame(event, inputs.cutoff(event), list(ANNOUNCED))
    assert frame["visitors_announced"][0] is None
    assert frame["log_visitors_announced"][0] is None
