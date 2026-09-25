"""자산 실행 순서·차단 검사·CLI 기록 및 승격 규칙의 보존을 검증한다."""

import json
from pathlib import Path

import pytest
from crowdcast import paths
from crowdcast.api.contract import validate
from crowdcast.data.datago_client import TransientDataGoError
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import run_record, stages
from crowdcast.pipeline.dagster_defs import defs
from crowdcast.pipeline.dagster_defs.assets import pipeline_assets
from crowdcast.pipeline.dagster_defs.execution import PipelineRun, pipeline_run
from dagster import AssetCheckSeverity, AssetKey, materialize
from dagster_fixtures import FakeStages
from pipeline_fixtures import latest_record


# 실제 materialize가 7개 자산·검사를 순서대로 실행하고 계약 기록과 파일 메타데이터를 남긴다.
def test_materialize_sequence_and_record(fake_stages: FakeStages, pipeline_root: Path) -> None:
    result = materialize(pipeline_assets, resources={"pipeline_run": pipeline_run})
    assert result.success
    assert fake_stages.calls == list(stages.STAGES[:-1])
    assert [event.asset_key for event in result.get_asset_materialization_events()] == [
        AssetKey(["crowdcast", name]) for name in stages.STAGES
    ]
    checks = result.get_asset_check_evaluations()
    assert len(checks) == 7 and all(check.passed for check in checks)

    # S8이 읽는 기존 계약·포인터·마크다운을 그대로 검증한다.
    record = latest_record(pipeline_root)
    validate("pipeline-run", record)
    assert record["status"] == "passed" and record["finishedAt"] is not None
    assert all(stage["status"] == "passed" and stage["ms"] >= 0 for stage in record["stages"])
    assert (paths.REPORTS / "runs" / record["runId"] / "run.md").is_file()
    assert fake_stages.clients[0].max_calls == 0 and fake_stages.clients[0].closed
    assert all(baseline == ({"기준": "실행 시작 때 사용 모델"}, None) for baseline in fake_stages.baselines)

    # 출력 해시·행 수·검사 메시지는 실행 기록의 같은 단계와 일치해야 한다.
    labels = result.asset_materializations_for_node("crowdcast__labels")[0]
    metadata = labels.metadata
    artifact = record["stages"][1]["artifacts"][0]
    assert artifact["sha256"] == run_record.sha256(paths.PROCESSED / "labels_dagster.parquet")
    assert metadata["outputFiles"].value == [{**artifact, "rows": 2}]
    assert metadata["rowCounts"].value == {artifact["path"]: 2}
    assert metadata["runId"].value == record["runId"]
    assert metadata["dagsterRunId"].value == result.run_id
    assert checks[1].description == record["stages"][1]["gate"]["message"]
    promoted = json.loads((paths.REPORTS / run_record.PROMOTED_POINTER).read_bytes())
    assert promoted["verdict"] == "통과"


# 어느 단계의 기존 게이트가 실패해도 해당 검사가 실패하고 모든 하류가 멈춘다.
@pytest.mark.parametrize("failed_stage", stages.STAGES[:-1])
def test_gate_failure_blocks_downstream(
    fake_stages: FakeStages, pipeline_root: Path, failed_stage: str
) -> None:
    fake_stages.verdicts[failed_stage] = False
    result = materialize(pipeline_assets, resources={"pipeline_run": pipeline_run}, raise_on_error=False)
    index = stages.STAGES.index(failed_stage)
    assert not result.success
    assert fake_stages.calls == list(stages.STAGES[: index + 1])
    record = latest_record(pipeline_root)
    assert record["status"] == "failed" and record["finishedAt"] is not None
    assert record["stages"][index]["status"] == "failed"
    assert all(stage["status"] == "pending" for stage in record["stages"][index + 1 :])
    check = result.get_asset_check_evaluations()[-1]
    assert not check.passed and check.severity == AssetCheckSeverity.ERROR
    assert check.description == record["stages"][index]["gate"]["message"]
    if index <= stages.STAGES.index("backtest"):
        assert not (paths.REPORTS / run_record.PROMOTED_POINTER).exists()


# 골든 미검증은 CLI처럼 임시 승격·batch를 허용하되 검증 통과로 표시하지 않는다.
def test_unverified_warns_and_continues(fake_stages: FakeStages, pipeline_root: Path) -> None:
    fake_stages.verdicts["backtest"] = None
    result = materialize(pipeline_assets, resources={"pipeline_run": pipeline_run})
    assert result.success and fake_stages.calls == list(stages.STAGES[:-1])
    record = latest_record(pipeline_root)
    assert record["status"] == "failed"
    assert record["stages"][4]["status"] == record["stages"][6]["status"] == "skipped"
    assert record["stages"][5]["status"] == "passed"
    checks = result.get_asset_check_evaluations()
    assert all(
        not checks[index].passed and checks[index].severity == AssetCheckSeverity.WARN for index in (4, 6)
    )
    assert json.loads((paths.REPORTS / run_record.PROMOTED_POINTER).read_bytes())["verdict"] == "미검증"


# 승격 오류도 기존 CLI 함수가 실패로 바꾼 최종 게이트를 검사 결과에 전달한다.
def test_promotion_failure_blocks_batch(
    fake_stages: FakeStages, pipeline_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 실제 후보 발행 실패를 주입해 잘못된 모델로 batch가 진행하지 않게 한다.
    def reject(*args: object) -> None:
        raise OSError("승격 파일 쓰기 실패")

    monkeypatch.setattr(stages, "promote", reject)
    result = materialize(pipeline_assets, resources={"pipeline_run": pipeline_run}, raise_on_error=False)
    assert not result.success and fake_stages.calls[-1] == "backtest"
    assert "사용 모델 승격 실패" in result.get_asset_check_evaluations()[-1].description
    assert latest_record(pipeline_root)["stages"][4]["status"] == "failed"


# fetch의 일시 오류만 CLI 재시도를 거치며 재시도 전후의 예산 자원이 동일하다.
def test_fetch_retry_shares_call_budget(fake_stages: FakeStages, pipeline_root: Path) -> None:
    fake_stages.errors["fetch"] = [TransientDataGoError("일시 수집 장애")]
    result = defs.resolve_job_def("crowdcast_pipeline").execute_in_process(
        run_config={"resources": {"pipeline_run": {"config": {"max_calls": 3}}}}
    )
    assert result.success
    assert fake_stages.calls[:2] == ["fetch", "fetch"]
    assert fake_stages.clients[0] is fake_stages.clients[1]
    assert fake_stages.clients[0].max_calls == 3
    message = latest_record(pipeline_root)["stages"][0]["gate"]["message"]
    assert "시도 1:" in message and "시도 2:" in message


# 개별 자산 실행의 선택 범위가 전체 완료로 오인되지 않도록 CLI와 같은 skipped 기록을 쓴다.
def test_subset_selection(fake_stages: FakeStages, pipeline_root: Path) -> None:
    result = materialize(
        pipeline_assets,
        resources={"pipeline_run": pipeline_run},
        selection=[AssetKey(["crowdcast", "labels"])],
    )
    assert result.success and fake_stages.calls == ["labels"]
    record = latest_record(pipeline_root)
    assert record["status"] == "passed"
    assert [stage["status"] for stage in record["stages"]] == [
        "skipped",
        "passed",
        "skipped",
        "skipped",
        "skipped",
        "skipped",
        "skipped",
    ]


# 취소·예외로 자산을 끝내지 못한 기록은 종료 처리에서 성공이 될 수 없다.
def test_interrupted_record_is_failed(fake_stages: FakeStages, pipeline_root: Path) -> None:
    execution = PipelineRun(stages.STAGES, 0, "dagster-interrupted")
    execution.finish()
    record = latest_record(pipeline_root)
    assert record["status"] == "failed" and record["finishedAt"] is not None
    assert record["stages"][0]["gate"]["passed"] is False


# publish도 가짜 승인 없이 기존 CLI의 선행 게이트 판정 결과를 그대로 쓴다.
def test_publish_only_is_unverified(fake_stages: FakeStages, pipeline_root: Path) -> None:
    result = materialize(
        pipeline_assets,
        resources={"pipeline_run": pipeline_run},
        selection=[AssetKey(["crowdcast", "publish"])],
    )
    record = latest_record(pipeline_root)
    assert result.success and fake_stages.calls == []
    assert record["stages"][-1]["gate"] == cli.publish_gate(record, False)
    assert record["status"] == "failed"
