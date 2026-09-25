"""실행 기록과 시점별 해시를 자산 계보 JSON으로 내보낸다."""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from crowdcast import paths
from crowdcast.api.contract import validate
from crowdcast.data.call_ledger import KST, atomic_write
from crowdcast.pipeline import run_record, stages


# 계보와 실행 스냅샷은 기존 원자 쓰기로 완성된 JSON만 공개한다.
def write_json(path: Path, value: dict[str, Any]) -> None:
    content = json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n"
    atomic_write(path, content.encode("utf-8"))


# 실행 기록 없는 파일은 현재 경로만 알려 주고 과거 실행 해시로 연결하지 않는다.
def unknown_files(files: list[Path]) -> list[dict[str, Any]]:
    return [
        {"path": path, "sha256": None} for path in sorted({run_record.artifact_path(file) for file in files})
    ]


# dry·진행 중 기록은 제외하고 자산마다 마지막 실제 실행의 기록과 해시를 선택한다.
def build_lineage() -> dict[str, Any]:
    latest: dict[str, tuple[dict[str, Any], dict[str, Any], dict[str, Any]]] = {}
    records = []
    for path in (paths.REPORTS / "runs").glob("*/run.json"):
        record = json.loads(path.read_bytes())
        validate("pipeline-run", record)
        if record["runId"].startswith("dry-") or record["finishedAt"] is None:
            continue
        records.append((record, path))

    # 디렉터리 이름 대신 시간대가 있는 시작 시각으로 정렬해 같은 실행의 스냅샷을 읽는다.
    for record, path in sorted(
        records, key=lambda row: (datetime.fromisoformat(row[0]["startedAt"]), row[0]["runId"])
    ):
        snapshot_path = path.with_name("lineage.json")
        snapshots = json.loads(snapshot_path.read_bytes()) if snapshot_path.is_file() else {}
        if snapshots and (snapshots.get("schemaVersion") != 1 or snapshots.get("runId") != record["runId"]):
            raise ValueError("계보 스냅샷의 버전 또는 runId 불일치")
        for stage in record["stages"]:
            if stage["ms"] is not None and stage["status"] in {"passed", "failed", "skipped"}:
                latest[stage["name"]] = (record, stage, snapshots)

    # 의존은 STAGES 순서에서 만들고 예전 CLI 기록의 입력 해시는 알 수 없음으로 유지한다.
    assets = []
    for index, name in enumerate(stages.STAGES):
        entry: dict[str, Any] = {
            "key": f"crowdcast/{name}",
            "deps": [f"crowdcast/{stages.STAGES[index - 1]}"] if index else [],
            "inputFiles": [],
            "outputFiles": [],
            "lastRunId": None,
            "dagsterRunId": None,
            "status": None,
            "gate": None,
        }
        if name in latest:
            record, stage, snapshots = latest[name]
            snapshot = snapshots.get("stages", {}).get(name)
            entry.update(
                lastRunId=record["runId"],
                dagsterRunId=snapshots.get("dagsterRunId"),
                status=stage["status"],
                gate=stage["gate"],
                inputFiles=(snapshot["inputFiles"] if snapshot else unknown_files(stages.input_files(name))),
                outputFiles=(
                    snapshot["outputFiles"]
                    if snapshot
                    else [{**item, "rows": None} for item in stage["artifacts"]]
                ),
            )
        else:
            entry["inputFiles"] = unknown_files(stages.input_files(name))
            entry["outputFiles"] = [
                {**item, "rows": None} for item in unknown_files(stages.output_files(name))
            ]
        assets.append(entry)
    return {"schemaVersion": 1, "exportedAt": datetime.now(KST).isoformat(), "assets": assets}


# 호출자가 지정한 파일에 계보만 쓰며 단계 실행·네트워크 호출은 하지 않는다.
def export_lineage(out: Path) -> dict[str, Any]:
    lineage = build_lineage()
    write_json(out, lineage)
    return lineage
