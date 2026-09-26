"""계보 내보내기의 실행 연결·과거 해시 보존·CLI 기록 호환성을 검증한다."""

import json
from pathlib import Path

import polars as pl
import pytest
from crowdcast import paths
from crowdcast.pipeline import run_record, stages
from crowdcast.pipeline.dagster_defs.__main__ import main
from crowdcast.pipeline.dagster_defs.assets import pipeline_assets
from crowdcast.pipeline.dagster_defs.execution import pipeline_run
from crowdcast.pipeline.dagster_defs.lineage import build_lineage, export_lineage
from crowdcast.pipeline.dagster_defs.metadata import row_count
from dagster import AssetKey, materialize
from dagster_fixtures import FakeStages
from pipeline_fixtures import latest_record


# 나중에 파일이 바뀌어도 T-605에는 마지막 실행이 사용한 입력·산출물 해시를 전달한다.
def test_export_preserves_run_snapshots(fake_stages: FakeStages, pipeline_root: Path) -> None:
    input_hash = run_record.sha256(paths.PROCESSED / "events.parquet")
    result = materialize(pipeline_assets, resources={"pipeline_run": pipeline_run})
    record = latest_record(pipeline_root)
    output = record["stages"][1]["artifacts"][0]
    (paths.PROCESSED / "labels_dagster.parquet").write_bytes(b"changed after run")
    (paths.PROCESSED / "events.parquet").unlink()
    destination = paths.REPORTS / "runs/lineage.json"
    assert main(["lineage", "--out", str(destination)]) == 0
    lineage = json.loads(destination.read_bytes())
    assert lineage["schemaVersion"] == 1 and lineage["exportedAt"].endswith("+09:00")
    assert [entry["key"] for entry in lineage["assets"]] == [f"crowdcast/{name}" for name in stages.STAGES]
    labels = lineage["assets"][1]
    assert labels["lastRunId"] == record["runId"] and labels["dagsterRunId"] == result.run_id
    assert labels["deps"] == ["crowdcast/fetch"]
    assert labels["outputFiles"] == [{**output, "rows": 2}]
    assert {"path": "data/processed/events.parquet", "sha256": input_hash} in labels["inputFiles"]
    assert str(pipeline_root) not in destination.read_text()
    assert fake_stages.calls == list(stages.STAGES[:-1])


# 후속 실패 실행에서 미실행인 자산은 이전 실행 연결을 보존하고 실패 자산만 새 기록을 가리킨다.
def test_latest_is_per_executed_asset(fake_stages: FakeStages, pipeline_root: Path) -> None:
    materialize(pipeline_assets, resources={"pipeline_run": pipeline_run})
    previous = latest_record(pipeline_root)
    fake_stages.verdicts["labels"] = False
    materialize(pipeline_assets, resources={"pipeline_run": pipeline_run}, raise_on_error=False)
    failed = latest_record(pipeline_root)
    lineage = build_lineage()["assets"]
    assert lineage[1]["lastRunId"] == failed["runId"] and lineage[1]["gate"]["passed"] is False
    assert lineage[2]["lastRunId"] == previous["runId"]


# sidecar가 없는 CLI 기록도 출력 해시를 보존하고 알 수 없는 입력 시점은 null로 표시한다.
def test_legacy_cli_records_and_dry_filter(pipeline_root: Path) -> None:
    output = paths.PROCESSED / "labels.parquet"
    record = run_record.new_record(stages.STAGES, ("labels",), False)
    stage = record["stages"][1]
    stage.update(status="passed", ms=10, gate={"passed": True, "message": "기존 CLI 라벨 게이트"})
    stage["artifacts"] = run_record.artifacts([output])
    run_record.finish_record(record, False, ("labels",))
    run_record.write_record(record)

    # 더 최신인 dry와 진행 중 기록은 실행 증거를 덮어쓸 수 없다.
    dry = run_record.new_record(stages.STAGES, ("labels",), True)
    dry["stages"][1].update(stage)
    run_record.finish_record(dry, True, ("labels",))
    run_record.write_record(dry)
    run_record.write_record(run_record.new_record(stages.STAGES, stages.STAGES, False))
    output.unlink()
    labels = build_lineage()["assets"][1]
    assert labels["lastRunId"] == record["runId"] and labels["dagsterRunId"] is None
    assert labels["outputFiles"] == [{**stage["artifacts"][0], "rows": None}]
    assert all(item["sha256"] is None for item in labels["inputFiles"])


# 실행 전에도 일곱 자산의 정적 계보를 읽을 수 있고 파일 생성은 지정 출력으로 한정된다.
def test_no_runs_exports_topology(pipeline_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # 계보 조회 중 단계 실행을 시도하면 즉시 실패시킨다.
    def reject(*args: object) -> None:
        raise AssertionError("계보 조회는 단계를 실행할 수 없습니다")

    monkeypatch.setattr(stages, "execute_stage", reject)
    destination = paths.REPORTS / "runs/lineage.json"
    lineage = export_lineage(destination)
    assert len(lineage["assets"]) == 7 and not list(destination.parent.glob("*/run.json"))
    for index, entry in enumerate(lineage["assets"]):
        assert entry["lastRunId"] is None and entry["status"] is None
        assert entry["deps"] == ([f"crowdcast/{stages.STAGES[index - 1]}"] if index else [])
        assert all(item["sha256"] is None for item in entry["inputFiles"] + entry["outputFiles"])


# 누락 입력은 null 해시로 구별되어 출력과 같은 파일로 잘못 연결되지 않는다.
def test_missing_input_is_explicit(fake_stages: FakeStages, pipeline_root: Path) -> None:
    (paths.PROCESSED / "diy_targets.csv").unlink()
    materialize(
        pipeline_assets,
        resources={"pipeline_run": pipeline_run},
        selection=[AssetKey(["crowdcast", "labels"])],
    )
    assert {"path": "data/processed/diy_targets.csv", "sha256": None} in build_lineage()["assets"][1][
        "inputFiles"
    ]


# 서로 다른 실행의 sidecar가 섞이면 잘못된 증거를 내보내는 대신 오류로 드러낸다.
def test_mismatched_snapshot_is_rejected(fake_stages: FakeStages, pipeline_root: Path) -> None:
    materialize(pipeline_assets, resources={"pipeline_run": pipeline_run}, selection=["crowdcast/labels"])
    record = latest_record(pipeline_root)
    snapshot = paths.REPORTS / "runs" / record["runId"] / "lineage.json"
    snapshot.write_text(json.dumps({"schemaVersion": 1, "runId": "다른-실행"}))
    with pytest.raises(ValueError, match="runId 불일치"):
        build_lineage()


# CSV 줄바꿈 셀·빈 JSONL 줄을 행 수로 중복 계산하지 않고 비표 형식은 미측정으로 남긴다.
def test_tabular_row_counts(tmp_path: Path) -> None:
    csv = tmp_path / "festivals.csv"
    csv.write_text('festival,note\n연천구석기축제,"전곡리\n유적"\n강릉커피축제,강릉\n', encoding="utf-8")
    jsonl = tmp_path / "festivals.jsonl"
    jsonl.write_text('{"festival":"연천구석기축제"}\n\n{"festival":"강릉커피축제"}\n')
    parquet = tmp_path / "festivals.parquet"
    pl.DataFrame({"festival": ["연천구석기축제", "강릉커피축제"]}).write_parquet(parquet)
    assert row_count(csv) == row_count(jsonl) == row_count(parquet) == 2
    assert row_count(tmp_path / "model_card.json") is None
    parquet.write_bytes(b"invalid parquet")
    assert row_count(parquet) is None
