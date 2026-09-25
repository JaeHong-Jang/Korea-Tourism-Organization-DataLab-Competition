"""도전 모델 발행·비교·예보 경로를 격리 실행해 동일 폴드와 기본 예보 바이트 불변성을 검증한다."""

import hashlib
import json
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.api.assemble import inputs
from crowdcast.api.assemble.forecast import predict
from crowdcast.api.assemble.model import load_model
from crowdcast.models.card import validate_contract
from crowdcast.models.challenger.backtest import matched_folds
from crowdcast.models.challenger.config import ChallengerConfig
from crowdcast.models.challenger.evidence import agreement_evidence
from crowdcast.models.challenger.report import json_bytes
from crowdcast.models.challenger.runner import execute
from crowdcast.models.challenger.snapshot import load_snapshot


# 비교 전 파일과 완성 예보를 기록하고 비교 뒤 캐시를 비운 실제 예보와 바이트 단위로 대조한다.
def test_published_comparison_preserves_forecast(published_run: dict) -> None:
    run_id, version = published_run["runId"], published_run["modelVersion"]
    inputs._table.cache_clear()
    load_model.cache_clear()
    event = json.loads(
        (paths.REPO_ROOT / "packages/contracts/fixtures/event/valid-yeongjong.json").read_bytes()
    )
    forecast = predict(event)
    before = json_bytes(forecast)
    original = {
        p: p.read_bytes()
        for root in (paths.MODELS / version, paths.REPORTS / "backtest")
        for p in root.rglob("*")
        if p.is_file()
    }
    settings = ChallengerConfig(iterations=80, draws=64)
    result = execute(run_id, settings)
    directory, reports = Path(result["models"]), Path(result["reports"])
    comparison = json.loads((reports / "comparison.json").read_bytes())
    source = load_snapshot(run_id)
    assert comparison["folds"] == source.manifest["folds"]
    assert comparison["inputHashes"] == source.manifest["input_hashes"]
    assert comparison["promotionEligible"] is False
    assert comparison["config"]["agreement_enabled"] is False
    assert {row["coverageN"] for row in comparison["metrics"] if row["year"] is None} == {48}
    assert "도전 모델 비교" in (reports / "comparison.md").read_text()
    card = json.loads((directory / "model_card.json").read_bytes())
    validate_contract("model-card", card)
    assert "도전 모델 비교" in card["notes"] and card["backtestRunId"] is None
    for path, raw in original.items():
        assert path.read_bytes() == raw, path
    load_model.cache_clear()
    assert json_bytes(predict(event)) == before
    hashes = json.loads((directory / "artifact_hashes.json").read_bytes())
    for name, digest in hashes.items():
        assert hashlib.sha256((paths.DATA_ROOT / name).read_bytes()).hexdigest() == digest

    # 명시적으로 켠 합의 함수만 계약 근거를 만들고 완성 예보 객체는 수정하지 않는다.
    assert agreement_evidence(event, forecast, directory) is None
    enabled = ChallengerConfig(agreement_enabled=True)
    evidence = agreement_evidence(event, forecast, directory, enabled)
    assert evidence is not None
    validate_contract("evidence", evidence)
    assert evidence["title"].startswith("두 모델 합의 ")
    assert evidence["forecastId"] == forecast["id"]
    assert evidence["quantityIds"] == [forecast["dailyMean"]["id"]]
    assert json.loads(evidence["summary"])["estimated"] is True
    assert agreement_evidence(event, forecast, directory, enabled) == evidence
    assert json_bytes(forecast) == before
    with pytest.raises(ValueError, match="버전"):
        agreement_evidence(event, {**forecast, "modelVersion": "v-other"}, directory, enabled)
    changed = deepcopy(forecast)
    changed["dailyMean"]["timeUnit"] = "기간누적"
    with pytest.raises(ValueError, match="단위"):
        agreement_evidence(event, changed, directory, enabled)
    with pytest.raises(ValueError, match="공개 시점"):
        agreement_evidence(event, {**forecast, "asOf": "2020-01-01"}, directory, enabled)

    # 같은 설정의 재실행은 완성된 사후분포·보고서·포인터 바이트를 모두 보존한다.
    saved = {p: p.read_bytes() for root in (directory, reports) for p in root.rglob("*") if p.is_file()}
    execute(run_id, settings)
    assert all(path.read_bytes() == raw for path, raw in saved.items())
    assert all(path.read_bytes() == raw for path, raw in original.items())

    # 같은 개수의 다른 라벨과 바뀐 실제 정답도 동일 모집단으로 통과시키지 않는다.
    changed_manifest = deepcopy(source.manifest)
    changed_manifest["folds"][0]["train_ids"][0] = "e-yeongjong-fireworks-2025"
    with pytest.raises(ValueError, match="라벨 ID 불일치"):
        matched_folds(replace(source, manifest=changed_manifest))
    changed_points = deepcopy(source.points)
    changed_points[0]["actual"] += 1
    with pytest.raises(ValueError, match="평가 라벨 불일치"):
        matched_folds(replace(source, points=changed_points))
    qc_path = paths.PROCESSED / "labels_g0.json"
    qc_bytes = qc_path.read_bytes()
    try:
        qc_path.write_bytes(qc_bytes + b"\n")
        with pytest.raises(ValueError, match="입력 해시"):
            load_snapshot(run_id)
    finally:
        qc_path.write_bytes(qc_bytes)

    # 발행된 피처 파일이 바뀌면 사후분포 적합 전에 해시 검사에서 중단한다.
    feature_path = source.directory / "feature_availability.parquet"
    feature_bytes = feature_path.read_bytes()
    try:
        feature_path.write_bytes(feature_bytes + b"\0")
        with pytest.raises(ValueError, match="발행 산출물 해시 불일치"):
            load_snapshot(run_id)
    finally:
        feature_path.write_bytes(feature_bytes)


# 실행 식별자로 상위 폴더를 열어 다른 산출물을 비교할 수 없다.
@pytest.mark.parametrize("run_id", ["../latest", "/tmp/backtest", ".staging-backtest"])
def test_run_path_rejection(run_id: str) -> None:
    with pytest.raises(ValueError, match="단일 경로"):
        load_snapshot(run_id)
