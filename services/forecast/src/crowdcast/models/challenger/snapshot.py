"""지정한 발행 실행의 입력 해시·피처·폴드·평가 정답을 읽기 전용으로 고정한다."""

import hashlib
import io
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.models.__main__ import read_inputs
from crowdcast.models.card import validate_contract
from crowdcast.models.challenger.encoding import check_features
from crowdcast.models.g0 import read_g0
from crowdcast.models.train import select_labels


# 입력·발행본은 비교 완료까지 같은 바이트인지 다시 검사할 수 있게 해시를 함께 보관한다.
@dataclass
class Snapshot:
    directory: Path
    reports: Path
    manifest: dict[str, Any]
    card: dict[str, Any]
    g0: dict[str, Any]
    frame: pl.DataFrame
    events: dict[str, dict[str, Any]]
    names: list[str]
    points: list[dict[str, Any]]
    hashes: dict[Path, str]

    # 비교 과정이나 동시 실행이 기준 파일을 바꾸면 산출물을 완료 상태로 발행하지 않는다.
    def verify(self) -> None:
        for path, digest in self.hashes.items():
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise ValueError(f"비교 기준 산출물이 변경되었습니다: {path.name}")


# 사용자 입력은 한 경로 조각만 받으며 staging·심볼릭 링크 경로 탈출을 거부한다.
def child(root: Path, name: str) -> Path:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]*", name):
        raise ValueError("실행·모델 식별자는 단일 경로 조각이어야 합니다")
    destination = root / name
    if destination.resolve().parent != root.resolve():
        raise ValueError("실행·모델 경로가 저장소 밖입니다")
    return destination


# 최신 후보가 아니라 명시한 runId만 열어 사용 모델과 후보를 혼동하지 않는다.
def load_snapshot(run_id: str) -> Snapshot:
    reports = child(paths.DATA_ROOT / "reports/backtest", run_id)
    backtest = json.loads((reports / "backtest.json").read_bytes())
    validate_contract("backtest-summary", backtest)
    if backtest["runId"] != run_id:
        raise ValueError("비교 백테스트 실행 ID 불일치")
    directory = child(paths.MODELS, backtest["modelVersion"])
    artifact_hashes = json.loads((directory / "artifact_hashes.json").read_bytes())
    hashes: dict[Path, str] = {}

    # 실제 읽은 바이트를 원래 발행 해시와 대조해 변경된 피처·점수를 사용하지 않는다.
    def read(path: Path) -> bytes:
        raw = path.read_bytes()
        prefix = "models" if path.is_relative_to(paths.MODELS) else "reports/backtest"
        root = paths.MODELS if prefix == "models" else reports.parent
        key = f"{prefix}/{path.relative_to(root)}"
        digest = hashlib.sha256(raw).hexdigest()
        if artifact_hashes.get(key) != digest:
            raise ValueError(f"발행 산출물 해시 불일치: {key}")
        hashes[path] = digest
        return raw

    manifest = json.loads(read(directory / "run.json"))
    card = json.loads(read(directory / "model_card.json"))
    validate_contract("model-card", card)
    if (
        manifest["run_id"] != run_id
        or manifest["model_version"] != directory.name
        or card["modelVersion"] != directory.name
        or card["backtestRunId"] != run_id
    ):
        raise ValueError("비교 모델 메타데이터 불일치")
    read(reports / "backtest.json")
    read(directory / "g0.json")
    frames, _, input_hashes = read_inputs(paths.PROCESSED)
    if input_hashes != manifest["input_hashes"]:
        raise ValueError("지정 실행과 현재 입력 해시가 다릅니다 — 당시 입력 스냅샷이 필요합니다")
    g0 = read_g0(directory / "g0.json", input_hashes)
    features = pl.read_parquet(io.BytesIO(read(directory / "feature_availability.parquet")))
    names = json.loads(read(directory / "features.json"))["features"]
    check_features(features, names)
    events = frames["events"].to_dicts()
    labels, _ = select_labels(frames["labels"], events, manifest["config"])
    frame = labels.join(features, on="event_id", how="inner", validate="1:1")
    if frame.height != labels.height:
        raise ValueError("발행 피처에 선택 라벨이 누락되었습니다")
    points = pl.read_parquet(io.BytesIO(read(reports / "points.parquet"))).to_dicts()
    points = [p for p in points if p.get("evaluation_definition", "conditional") == "conditional"]

    # 채점에 쓰는 기준선·OOD도 발행 당시 파일로 고정한다.
    for fold in manifest["folds"]:
        if fold["skipped"] is None:
            for name in ("simple.json", "ood.json"):
                read(directory / str(fold["year"]) / name)
    return Snapshot(
        directory,
        reports,
        manifest,
        card,
        g0,
        frame,
        {e["event_id"]: e for e in events},
        names,
        points,
        hashes,
    )
