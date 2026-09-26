"""실제 추론 라우트의 근거·계보·결정성과 공개 시점 경계를 검사한다."""

import json
from datetime import date
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.api.assemble import inputs, observations
from crowdcast.api.assemble.model import current_model, load_model
from crowdcast.api.contract import validate
from crowdcast.rules.peak import round_people
from fastapi.testclient import TestClient


# 분위수 숫자 자체 대신 영종 사례의 근거 종류와 인원 무관 사유를 고정한다.
def test_yeongjong_snapshot(client: TestClient, forecast_data: Path, event: dict) -> None:
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    validate("forecast", result)
    assert result["asOf"] == "2025-10-04"
    assert result["eventId"] == event["id"]
    assert result["predictionRun"]["modelVerdict"] == "미검증"
    # OOD 예보만 참고용 확인 근거(check)를 더 싣는다(S10).
    expected = {"data", "model", "case", "assumption", "rule"} | ({"check"} if result["ood"] else set())
    assert {row["kind"] for row in result["evidence"]} == expected
    checks = [row for row in result["evidence"] if row["kind"] == "check"]
    assert all(
        row["checkResult"]["checkKind"] == "ood" and row["forecastId"] == result["id"] for row in checks
    )
    reason = next(row for row in result["judgment"]["reasons"] if row["ruleId"] == "rule-legal-hazard")
    assert reason["kind"] == "법정"
    assert reason["clauseId"] == "law-disaster-act-enf-73-9"
    assert "인원과 관계없이" in reason["text"]
    assert result["judgment"]["level"] >= 3
    for key in ("dailyMean", "peakConcurrent"):
        quantity = result[key]
        assert 0 <= quantity["p10"] <= quantity["p50"] <= quantity["p90"] < 1e9
        assert any(quantity["id"] in row["quantityIds"] for row in result["evidence"])
    assert len(result["factors"]) == 5
    assert all(row["evidenceIds"] for row in result["factors"])
    assert result["peakHours"] is None and result["hourlyProfile"] == []
    assert sum(result["composition"][key] for key in ("local", "nonlocal", "foreign")) == pytest.approx(1)
    assert response.content == client.post("/v1/predict", json=event).content


# 관측마다 출처와 공개일을 가져오고 행사 입력은 관측 개수에 넣지 않는다.
def test_observation_lineage_and_lookup_ids(client: TestClient, forecast_data: Path, event: dict) -> None:
    result = client.post("/v1/predict", json=event).json()
    model, _ = current_model()
    frame = observations.feature_frame(event, inputs.cutoff(event), model.card["features"])
    row = frame.row(0, named=True)
    names = {
        name for name in model.card["features"] if row[f"{name}_is_observation"] and row[name] is not None
    }
    assert {item["featureName"] for item in result["observations"]} == names
    assert set(result["predictionRun"]["observationIds"]) == {item["id"] for item in result["observations"]}
    assert len(result["observations"]) == len(result["predictionRun"]["observationIds"]) == 4
    for item in result["observations"]:
        name = item["featureName"]
        assert item["availableAt"] <= result["asOf"]
        assert item["datasetId"] == row[f"{name}_dataset_id"]
        assert item["sigunguCode"] == row[f"{name}_sigungu_code"]
        assert item["observedAt"] == row[f"{name}_observed_at"].isoformat()
        assert item["unit"] == row[f"{name}_unit"]
    evidence = {item["id"]: item for item in result["evidence"]}
    for factor in result["factors"]:
        for evidence_id in factor["evidenceIds"]:
            assert evidence_id in evidence
            if factor["feature"] in names:
                content = json.loads(evidence[evidence_id]["summary"])
                assert content["featureName"] == factor["feature"]
    baseline = client.get("/v1/baseline", params={"sigunguCode": "28110", "before": result["asOf"]}).json()
    similar = client.post("/v1/similar", json=event).json()
    for item in [*baseline["evidence"], *(piece for case in similar for piece in case["evidence"])]:
        assert evidence[item["id"]] == item


# 시작 사흘 전 요청도 D-14를 유지하고 조기 요청은 오늘까지만 사용한다.
@pytest.mark.parametrize(
    "today,expected", [(date(2025, 10, 15), "2025-10-04"), (date(2025, 9, 1), "2025-09-01")]
)
def test_effective_as_of(
    client: TestClient,
    forecast_data: Path,
    event: dict,
    monkeypatch: pytest.MonkeyPatch,
    today: date,
    expected: str,
) -> None:
    monkeypatch.setattr(inputs, "today", lambda: today)
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["asOf"] == expected
    assert result["predictionRun"]["asOf"] == expected
    assert all(row["availableAt"] <= expected for row in result["observations"])


# 잘못된 계보를 주입해 생성기 이후의 가용성 검사도 실패를 숨기지 않는지 확인한다.
def test_availability_violation_is_500(
    client: TestClient, forecast_data: Path, event: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    original = observations.build.build_features

    # 이름에 의존하지 않고 값 있는 관측 한 개의 공개일만 오염시킨다.
    def future_feature(*args: object, **kwargs: object) -> tuple:
        frame, names = original(*args, **kwargs)
        row = frame.row(0, named=True)
        name = next(name for name in names if row[f"{name}_is_observation"] and row[name] is not None)
        return frame.with_columns(pl.lit(date(2099, 1, 1)).alias(f"{name}_available_at")), names

    monkeypatch.setattr(observations.build, "build_features", future_feature)
    assert client.post("/v1/predict", json=event).status_code == 500


# 자료는 존재하지만 공개된 관측이 하나도 없으면 결측 대체 모델로 예보하지 않는다.
def test_no_observation_503(client: TestClient, forecast_data: Path, event: dict) -> None:
    for name in ("labels", "region_daily"):
        frame = pl.read_parquet(paths.PROCESSED / f"{name}.parquet")
        frame.with_columns(pl.lit(date(2099, 1, 1)).alias("available_at")).write_parquet(
            paths.PROCESSED / f"{name}.parquet"
        )
    response = client.post("/v1/predict", json=event)
    assert response.status_code == 503
    assert response.json() == {
        "code": "NO_OBSERVATION",
        "message": "공개된 지역 관측·전회차 실측이 없어 예보를 만들 수 없어요",
    }


# 계약 밖 공간 범위는 전회차 관측으로도 흘러들지 않는다.
def test_gold_b_history_excluded(client: TestClient, forecast_data: Path, event: dict) -> None:
    frame = pl.read_parquet(paths.PROCESSED / "labels.parquet")
    frame.with_columns(
        pl.lit("goldB").alias("label_tier"), pl.lit("지정영역").alias("spatial_scope")
    ).write_parquet(paths.PROCESSED / "labels.parquet")
    result = client.post("/v1/predict", json=event).json()
    assert all(row["datasetId"] != "ds-datalab-diy" for row in result["observations"])
    assert len(result["observations"]) == 3


# 개편 지역의 이후 자료가 큰 값이어도 유입되지 않으며 OOD 사유를 보존한다.
@pytest.mark.parametrize("code", ["28110", "28140", "28260"])
def test_continuity_break(client: TestClient, forecast_data: Path, event: dict, code: str) -> None:
    frame = pl.read_parquet(paths.PROCESSED / "region_daily.parquet").filter(
        pl.col("sigungu_code") == "28110"
    )
    frame = frame.with_columns(
        pl.lit(code).alias("sigungu_code"),
        (pl.col("date") + pl.duration(days=319)).alias("date"),
        (pl.col("available_at") + pl.duration(days=319)).alias("available_at"),
    )
    frame = frame.with_columns(
        pl.when(pl.col("date") >= date(2026, 7, 1)).then(1e8).otherwise(pl.col("visitors")).alias("visitors")
    )
    frame.write_parquet(paths.PROCESSED / "region_daily.parquet")
    event.update(startsAt="2026-08-15T19:00:00+09:00", endsAt="2026-08-15T21:00:00+09:00", sigunguCode=code)
    result = client.post("/v1/predict", json=event).json()
    assert result["ood"] is True
    assert "행정구역 개편 — 2026-06-30까지 자료만" in result["oodReasons"]
    assert all(row["observedAt"] <= "2026-06-30" for row in result["observations"])


# 단순 모델을 선택한 발행본은 그 예측과 구간 표시를 쓰고 타 모델 SHAP을 섞지 않는다.
def test_simple_primary_model(client: TestClient, forecast_data: Path, event: dict) -> None:
    (paths.MODELS / "v0.1.0/g0.json").write_text(json.dumps({"primary_model": "simple", "basis": "구간"}))
    load_model.cache_clear()
    result = client.post("/v1/predict", json=event).json()
    model, _ = current_model()
    frame = observations.feature_frame(event, inputs.cutoff(event), model.card["features"])
    assert result["dailyMean"]["p50"] == round_people(model.simple.predict(frame)[0][1])
    assert result["factors"] == []
    assert result["judgment"]["basis"] == "구간"
    assert all("표본 한계로 구간 기준 표시" in row["display"] for row in result["probabilities"])


# 개편 전 기준일(2025년 영종)은 정상 자료라 개편 사유·강제 OOD를 붙이지 않는다.
def test_no_break_reason_before_change(client: TestClient, forecast_data: Path, event: dict) -> None:
    result = client.post("/v1/predict", json=event).json()
    assert event["sigunguCode"] == "28110" and result["asOf"] < "2026-07-01"
    assert "행정구역 개편 — 2026-06-30까지 자료만" not in result["oodReasons"]
