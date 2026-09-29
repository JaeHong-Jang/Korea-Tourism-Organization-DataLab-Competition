"""실험 파일이 없거나 손상돼도 기존 예보를 가리지 않고 입력이 달라진 성적을 숨긴다."""

import hashlib
import json

from crowdcast import paths
from crowdcast.analytics.insights.i2_model_review import model_review


# 보조 실험의 실패를 본 예보 요청의 실패로 전파하지 않는다.
def test_optional_experiment_isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "PROCESSED", tmp_path)
    assert model_review() is None
    file = tmp_path / "insight_model_experiment.json"
    file.write_text("{broken", encoding="utf-8")
    assert model_review() is None
    file.write_text("[]", encoding="utf-8")
    assert model_review() is None


# 기존 입력과 한 바이트라도 달라지면 이전 성적을 새 자료의 결과로 표시하지 않는다.
def test_review_requires_current_input_hashes(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "PROCESSED", tmp_path)
    hashes = {}
    for key in ("labels", "events", "region_daily", "labels_g0"):
        path = tmp_path / (f"{key}.json" if key == "labels_g0" else f"{key}.parquet")
        path.write_bytes(b"snapshot")
        hashes[key] = hashlib.sha256(b"snapshot").hexdigest()
    content = {
        "inputHashes": hashes,
        "runId": "test",
        "computedAt": "2026-09-28",
        "status": "후보",
        "promoted": False,
        "limitations": [],
        "evaluations": [
            {
                "candidate": "history",
                "definition": "conditional",
                "scores": [],
                "folds": [{"year": 2025, "skipped": None}],
            }
        ],
    }
    (tmp_path / "insight_model_experiment.json").write_text(json.dumps(content), encoding="utf-8")
    assert model_review()["runId"] == "test"
    (tmp_path / "labels.parquet").write_bytes(b"new")
    assert model_review() is None
