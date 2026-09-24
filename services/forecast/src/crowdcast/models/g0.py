"""라벨 QC만으로 주 모델·표시 방식을 평가 전에 고정하고 불변 파일로 보존한다."""

import json
from pathlib import Path
from typing import Any


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
    labels_sha256: str,
    eval_years: list[int],
    model_version: str,
) -> Path:
    if qc["labels_sha256"] != labels_sha256:
        raise ValueError("G0 QC와 labels.parquet SHA-256 불일치")
    result = {**decide(qc["g0"], eval_years), "labels_sha256": labels_sha256, "model_version": model_version}
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "g0.json"
    content = json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    try:
        with path.open("x", encoding="utf-8") as stream:
            stream.write(content)
    except FileExistsError:
        if path.read_text(encoding="utf-8") != content:
            raise ValueError("기존 G0 변경 금지 — 새 모델 버전이 필요합니다") from None
    return path


# 백테스트는 사전 결정을 읽기만 하고 해시·규칙 불일치 시 실패한다.
def read_g0(path: Path, labels_sha256: str) -> dict[str, Any]:
    frozen = json.loads(path.read_text(encoding="utf-8"))
    if frozen["labels_sha256"] != labels_sha256:
        raise ValueError("G0의 라벨 스냅샷과 백테스트 입력이 다릅니다")
    expected = decide(frozen, frozen["eval_years"])
    if any(frozen[key] != value for key, value in expected.items()):
        raise ValueError("G0 사전 규칙 불일치")
    return frozen
