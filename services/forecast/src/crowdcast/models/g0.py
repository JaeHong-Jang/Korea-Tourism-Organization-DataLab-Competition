"""라벨 QC만으로 주 모델·표시 방식을 평가 전에 고정하고 불변 파일로 보존한다."""

import json
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast.labels.g0 import build_g0
from crowdcast.models.publish import write_atomic

# G0 수치를 결정하는 세 원본은 한 묶음으로 고정한다.
G0_INPUTS = {"labels.parquet": "labels", "labels_g0.json": "labels_g0", "events.parquet": "events"}
INPUT_CHANGED = "입력이 바뀌었다 — T-103부터 다시"


# 파일명까지 고정해 누락된 QC·행사 해시도 일치로 취급하지 않는다.
def g0_hashes(input_hashes: dict[str, str]) -> dict[str, str]:
    return {filename: input_hashes[key] for filename, key in G0_INPUTS.items()}


# 성적을 인자로 받지 않는 세 갈래 규칙으로 표본 수만 해석한다.
def decide(qc: dict[str, Any], eval_years: list[int]) -> dict[str, Any]:
    summary = qc["gold_summary"]
    counts = {row["year"]: row["gold_event_count"] for row in qc["gold_by_year"]}
    gold = summary["gold_event_count"]
    sides = min(summary["peak_below_1000_count"], summary["peak_ge_1000_count"]) >= 10
    enough = gold >= 60 and all(counts.get(year, 0) >= 15 for year in eval_years) and sides
    branch = "simple" if gold < 30 else "planned" if enough else "partial"
    return {
        "branch": branch,
        "primary_model": "simple" if branch == "simple" else "lightgbm",
        "basis": "구간" if branch == "simple" or not sides else "확률",
        "gold_summary": summary,
        "gold_by_year": qc["gold_by_year"],
        "eval_years": eval_years,
    }


# 최초 실행에서만 파일을 만들며 같은 버전의 사전 결정을 덮어쓰지 않는다.
def freeze_g0(
    directory: Path,
    qc: dict[str, Any],
    input_hashes: dict[str, str],
    eval_years: list[int],
    model_version: str,
) -> Path:
    if qc["labels_sha256"] != input_hashes["labels"]:
        raise ValueError(f"{INPUT_CHANGED} (G0 QC와 labels.parquet SHA-256 불일치)")
    result = {
        **decide(qc["g0"], eval_years),
        "labels_sha256": input_hashes["labels"],
        "input_sha256": g0_hashes(input_hashes),
        "model_version": model_version,
    }
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "g0.json"
    content = json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n"

    # 처음 고정할 때는 완성된 임시 파일을 원자적으로 옮겨 부분 파일이 남지 않게 한다(실행 잠금 안).
    if not path.exists():
        write_atomic(path, content.encode("utf-8"))
        return path
    read_g0(path, input_hashes)
    if path.read_text(encoding="utf-8") != content:
        raise ValueError("기존 G0 변경 금지 — 새 모델 버전이 필요합니다")
    return path


# 백테스트는 사전 결정을 읽기만 하고 해시·규칙 불일치 시 실패한다.
def read_g0(path: Path, input_hashes: dict[str, str]) -> dict[str, Any]:
    frozen = json.loads(path.read_text(encoding="utf-8"))
    if frozen.get("input_sha256") != g0_hashes(input_hashes):
        raise ValueError(INPUT_CHANGED)
    if frozen["labels_sha256"] != input_hashes["labels"]:
        raise ValueError(INPUT_CHANGED)
    expected = decide(frozen, frozen["eval_years"])
    if any(frozen[key] != value for key, value in expected.items()):
        raise ValueError("G0 사전 규칙 불일치")
    return frozen


# QC의 G0 집계가 지금 labels·events로 다시 계산한 값과 같을 때만 사전 판정의 근거로 쓴다.
def verify_qc(qc: dict[str, Any], labels: pl.DataFrame, events: list[dict[str, Any]]) -> None:
    again = json.loads(json.dumps(build_g0(labels, events), ensure_ascii=False, allow_nan=False))
    if again != qc["g0"]:
        raise ValueError(f"{INPUT_CHANGED} (현재 labels·events로 다시 계산한 G0 집계가 QC와 다름)")


# 완료 포인터가 가리키는 직전 버전과 달라진 G0 입력을 기록한다(입력 검증은 verify_qc가 맡는다).
def previous_version(models: Path, input_hashes: dict[str, str], pointer: Path) -> dict[str, Any] | None:
    if not pointer.exists():
        return None
    version = json.loads(pointer.read_text(encoding="utf-8"))["modelVersion"]
    previous = json.loads((models / version / "run.json").read_text(encoding="utf-8"))["input_hashes"]
    changed = sorted(key for key in G0_INPUTS.values() if previous.get(key) != input_hashes[key])
    return {"modelVersion": version, "changedInputs": changed} if changed else None
