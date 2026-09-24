"""실행 상태를 계약으로 검증하고 상대 경로·파일 해시와 함께 원자적으로 저장한다."""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from secrets import token_hex
from typing import Any

from crowdcast import paths
from crowdcast.api.contract import validate
from crowdcast.data.call_ledger import KST, atomic_write

FETCH_STATE_MARKER = "; 수집 상태 JSON: "


# dry·진행 중 기록을 제외하고 직전 수집 단계의 관측일·성공 시각을 이어받는다.
def fetch_history() -> dict[str, str | None]:
    runs = paths.REPORTS / "runs"
    for path in sorted(runs.glob("*/run.json"), reverse=True):
        if path.parent.name.startswith("dry-"):
            continue
        record = json.loads(path.read_bytes())
        if record["finishedAt"] is None:
            continue
        for stage in record["stages"]:
            message = stage["gate"]["message"]
            if stage["name"] == "fetch" and FETCH_STATE_MARKER in message:
                return json.loads(message.rsplit(FETCH_STATE_MARKER, 1)[1])
    return {"latest": None, "last_success": None}


# 큰 산출물도 한 번에 메모리에 올리지 않고 실제 파일 바이트를 해시한다.
def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


# 공유 링크의 실제 위치와 무관하게 계약에는 저장소 기준 경로를 남긴다.
def artifact_path(path: Path) -> str:
    resolved = path.resolve()
    for prefix, root in (("data", paths.DATA), ("models", paths.MODELS), ("reports", paths.REPORTS)):
        if resolved.is_relative_to(root.resolve()):
            return f"{prefix}/{resolved.relative_to(root.resolve()).as_posix()}"
    # reports/runs만 링크된 워크트리에서도 본 레포의 절대 경로를 노출하지 않는다.
    if resolved.is_relative_to((paths.REPORTS / "runs").resolve()):
        return "reports/runs/" + resolved.relative_to((paths.REPORTS / "runs").resolve()).as_posix()
    raise ValueError("산출물은 data/·models/·reports/ 안에 있어야 합니다")


# 같은 파일 목록은 같은 순서와 해시로 기록한다.
def artifacts(files: list[Path]) -> list[dict[str, str]]:
    return sorted(
        ({"path": artifact_path(path), "sha256": sha256(path)} for path in set(files) if path.is_file()),
        key=lambda row: row["path"],
    )


# 선택 범위 밖은 건너뜀, 실행 전인 선택 단계는 대기로 구별한다.
def new_record(names: tuple[str, ...], selected: tuple[str, ...], dry: bool) -> dict[str, Any]:
    started = datetime.now(KST)
    run_id = started.strftime("%Y%m%dT%H%M%S%f+0900") + "-" + token_hex(3)
    return {
        "runId": ("dry-" if dry else "") + run_id,
        "startedAt": started.isoformat(),
        "finishedAt": None,
        "status": "running",
        "stages": [
            {
                "name": name,
                "status": "pending" if name in selected else "skipped",
                "gate": {"passed": None, "message": "실행 대기" if name in selected else "선택 범위 밖"},
                "ms": None,
                "artifacts": [],
            }
            for name in names
        ],
        "summary": "dry 입력·게이트 검사 중" if dry else "파이프라인 실행 중",
    }


# 사람이 보는 기록도 JSON의 게이트 문구·해시를 그대로 사용한다.
def markdown(record: dict[str, Any]) -> str:
    lines = [
        f"# 실행 {record['runId']}",
        "",
        record["summary"],
        "",
        f"시작: {record['startedAt']}; 종료: {record['finishedAt']}",
        "",
        "참고용 — 담당자 검토 필수",
        "",
    ]
    for stage in record["stages"]:
        lines += [
            f"## {stage['name']} · {stage['status']}",
            "",
            f"소요: {stage['ms']} ms; gate.passed={stage['gate']['passed']}",
            "",
            stage["gate"]["message"],
            "",
        ]
        lines += [f"- {item['path']} · `{item['sha256']}`" for item in stage["artifacts"]]
        lines.append("")
    return "\n".join(lines)


# 계약 위반이면 디렉터리조차 만들지 않고 직전 유효 기록을 보존한다.
def write_record(record: dict[str, Any]) -> Path:
    validate("pipeline-run", record)
    content = json.dumps(record, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n"
    directory = paths.REPORTS / "runs" / record["runId"]
    atomic_write(directory / "run.json", content.encode())
    atomic_write(directory / "run.md", markdown(record).encode())
    atomic_write(directory.parent / "latest.json", (json.dumps({"runId": record["runId"]}) + "\n").encode())
    return directory / "run.json"


# 선택 단계의 미완료는 실패로 기록하고 게이트 실패와 다른 종료 코드를 준다.
def finish_record(record: dict[str, Any], dry: bool, selected: tuple[str, ...]) -> int:
    record["finishedAt"] = datetime.now(KST).isoformat()
    failed = next((stage for stage in record["stages"] if stage["status"] == "failed"), None)
    skipped = [s["name"] for s in record["stages"] if s["name"] in selected and s["status"] == "skipped"]
    absent = [
        s["name"] for s in record["stages"] if s["name"] in skipped and "진입점 없음:" in s["gate"]["message"]
    ]
    record["status"] = "failed" if failed or skipped else "passed"
    summary = "; ".join(f"{stage['name']}={stage['status']}" for stage in record["stages"])
    record["summary"] = ("dry 검사: " if dry else "실행 결과: ") + summary + "."
    if absent:
        record["summary"] += " 미구현 단계: " + ", ".join(absent) + "."
    if unverified := [name for name in skipped if name not in absent]:
        record["summary"] += " 미검증 단계: " + ", ".join(unverified) + "."
    return 1 if failed else (2 if skipped else 0)
