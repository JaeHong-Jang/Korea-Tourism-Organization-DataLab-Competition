"""실행 기록과 해시가 일치하는 산출물에서 요약에 쓸 사실·행 수·모델 버전을 모은다."""

import hashlib
import json
from pathlib import Path
from typing import Any

import polars as pl
from crowdcast import paths
from crowdcast.pipeline.record_privacy import public_text, relative_artifact
from crowdcast.pipeline.run_record import FETCH_STATE_MARKER


# 모델 산출물 경로의 버전은 기록 당시 값이며 현재 승격 포인터로 과거를 덮어쓰지 않는다.
def artifact_facts(artifact: dict[str, str]) -> list[str]:
    relative = artifact["path"]
    if not relative_artifact(relative):
        return []
    parts = Path(relative).parts
    facts = [f"기록 모델 버전 {parts[1]}."] if parts[0] == "models" else []
    if not (relative.endswith(".parquet") or parts[-1] in {"model_card.json", "backtest.json"}):
        return facts
    roots = {"data": paths.DATA, "models": paths.MODELS, "reports": paths.REPORTS}
    root = roots[parts[0]]
    # 보고서 하위 공유 링크도 인정하되 그 밖의 임의 심볼릭 링크는 열지 않는다.
    if parts[0] == "reports" and parts[1] in {"runs", "backtest"}:
        root, parts = root / parts[1], parts[1:]
    path = root.joinpath(*parts[1:])
    if not path.resolve().is_relative_to(root.resolve()):
        return facts
    try:
        with path.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != artifact["sha256"]:
                return [*facts, f"{relative} 변경으로 실행 당시 추가 사실 확인 불가."]
            stream.seek(0)
            if path.suffix == ".parquet":
                count = pl.read_parquet(stream, columns=[0]).height
                return [*facts, f"{relative} 행 수 {count}."]
            document = json.load(stream)
            if version := document.get("modelVersion"):
                facts.append(f"기록 모델 버전 {public_text(str(version))}.")
    except (OSError, ValueError, TypeError, pl.exceptions.PolarsError):
        facts.append(f"{relative} 실행 당시 추가 사실 확인 불가.")
    return facts


# 실패·건너뜀·dry를 성공으로 요약하지 않도록 상태와 모든 게이트 문구를 사실 목록에 남긴다.
def facts(record: dict[str, Any]) -> list[str]:
    prefix = "dry 검사: " if record["runId"].startswith("dry-") else "실행 결과: "
    result = [prefix + "; ".join(f"{s['name']}={s['status']}" for s in record["stages"]) + "."]
    absent, unverified = [], []
    for stage in record["stages"]:
        message = public_text(stage["gate"]["message"].split(FETCH_STATE_MARKER)[0])
        result.append(f"{stage['name']} 게이트: {message}.")
        if stage["status"] == "skipped" and message != "선택 범위 밖":
            (absent if "진입점 없음:" in message else unverified).append(stage["name"])
        for artifact in stage["artifacts"]:
            result.extend(artifact_facts(artifact))
    if absent:
        result.append("미구현 단계: " + ", ".join(absent) + ".")
    if unverified:
        result.append("미검증 단계: " + ", ".join(unverified) + ".")
    return list(dict.fromkeys(result))
