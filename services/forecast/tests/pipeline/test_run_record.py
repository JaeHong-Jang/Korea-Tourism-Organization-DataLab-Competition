"""실행 기록 계약·KST 식별자·결정적 상대 경로 해시와 저장 전 검증을 확인한다."""

import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.api.contract import validate
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import run_record, stages
from jsonschema import ValidationError
from pipeline_fixtures import latest_record


# 같은 입력의 두 실행은 ID만 달라도 라벨 산출물 해시가 동일해야 한다.
def test_record_contract_and_deterministic_hashes(
    pipeline_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(stages, "command", lambda *args: (0, ""))
    records = []
    for _ in range(2):
        assert cli.main(["--from", "labels", "--to", "labels"]) == 0
        record = latest_record(pipeline_root)
        records.append(record)
        validate("pipeline-run", record)
        assert datetime.fromisoformat(record["startedAt"]).utcoffset() == timedelta(hours=9)
        assert record["finishedAt"] is not None
        assert record["stages"][1]["ms"] >= 0
        for artifact in record["stages"][1]["artifacts"]:
            assert artifact["path"].startswith("data/processed/")
            assert (
                artifact["sha256"]
                == hashlib.sha256((pipeline_root / artifact["path"]).read_bytes()).hexdigest()
            )
        summary = (paths.REPORTS / "runs" / record["runId"] / "run.md").read_text()
        assert record["summary"] in summary and record["stages"][1]["gate"]["message"] in summary
    assert records[0]["runId"] != records[1]["runId"]
    assert records[0]["stages"][1]["artifacts"] == records[1]["stages"][1]["artifacts"]


# 잘못된 기록은 기존 latest를 바꾸거나 새 실행 디렉터리를 만들 수 없다.
def test_validate_before_writing(pipeline_root: Path) -> None:
    record = run_record.new_record(stages.STAGES, ("fetch",), False)
    run_record.write_record(record)
    latest = (paths.REPORTS / "runs/latest.json").read_bytes()
    invalid = {**record, "runId": record["runId"] + "-invalid", "status": "success"}
    with pytest.raises(ValidationError):
        run_record.write_record(invalid)
    assert (paths.REPORTS / "runs/latest.json").read_bytes() == latest
    assert not (paths.REPORTS / "runs" / invalid["runId"]).exists()


# 파일 해시는 UTF-8 재인코딩이나 JSON 재정렬 없이 원래 바이트를 기준으로 한다.
def test_binary_hash_and_outside_root(pipeline_root: Path) -> None:
    path = paths.MODELS / "연천.bin"
    path.write_bytes(b"\x00\xff\x01\r\n")
    assert run_record.artifacts([path, path]) == [
        {"path": "models/연천.bin", "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    ]
    with pytest.raises(ValueError, match="산출물"):
        run_record.artifact_path(pipeline_root / "outside.json")
    assert json.loads(json.dumps(run_record.artifacts([path])))[0]["path"] == "models/연천.bin"
