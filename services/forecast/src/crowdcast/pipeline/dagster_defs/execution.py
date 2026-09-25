"""Dagster 실행 하나의 CLI 기록·호출 예산·승격 기준을 공유한다."""

from collections.abc import Iterator
from contextlib import ExitStack
from pathlib import Path
from time import perf_counter_ns
from typing import Any

from crowdcast import paths
from crowdcast.data.datago_client import safe_error
from crowdcast.pipeline import __main__ as cli
from crowdcast.pipeline import gates, run_record, stages
from crowdcast.pipeline.dagster_defs.lineage import write_json
from crowdcast.pipeline.dagster_defs.metadata import input_snapshot, output_snapshot
from dagster import AssetKey, Field, InitResourceContext, Int, resource


# 한 프로세스에서 실행하는 자산들이 CLI와 같은 기록 및 백테스트 비교 기준을 공유한다.
class PipelineRun:
    # 자산 선택 범위 밖은 CLI처럼 skipped로 남기고 시작 기준은 train 전에 읽는다.
    def __init__(self, selected: tuple[str, ...], max_calls: int, dagster_run_id: str) -> None:
        if max_calls < 0:
            raise ValueError("max_calls는 0 이상이어야 합니다")
        self.selected = selected
        self.max_calls = max_calls
        self.dagster_run_id = dagster_run_id
        self.record = run_record.new_record(stages.STAGES, selected, False)
        self.baseline = gates.promoted_result()
        self.snapshots: dict[str, dict[str, Any]] = {}
        run_record.write_record(self.record)

    # 데이터 처리·재시도·publish 판정은 CLI 진입점에 맡기고 상태 전이만 Dagster에 연결한다.
    def execute(self, name: str) -> tuple[dict[str, Any], dict[str, Any]]:
        stage = next(row for row in self.record["stages"] if row["name"] == name)
        stage["status"] = "running"
        stage["gate"]["message"] = "실행 중"
        run_record.write_record(self.record)
        started = perf_counter_ns()
        files: list[Path] = []
        inputs: list[dict[str, Any]] = []
        outputs: list[dict[str, Any]] = []
        try:
            inputs = input_snapshot(stages.input_files(name))
            with ExitStack() as stack:
                client = (
                    stack.enter_context(stages.VisitorClient(max_calls=self.max_calls))
                    if name == "fetch"
                    else None
                )
                gate = cli.run_stage(name, self.record, False, client, files, self.baseline)
                if name == "fetch":
                    files = stages.output_files(name)
                stage["artifacts"] = run_record.artifacts(files)
                outputs = output_snapshot(stage["artifacts"], files)
        except Exception as exc:
            gate = {"passed": False, "message": f"{type(exc).__name__}: {safe_error(exc)}"}

        # 미검증과 실패를 구별하고 CLI와 같은 시점에 기록을 저장한 뒤 후보를 승격한다.
        stage["gate"] = gate
        stage["status"] = "skipped" if gate["passed"] is None else ("passed" if gate["passed"] else "failed")
        stage["ms"] = (perf_counter_ns() - started) // 1_000_000
        run_record.write_record(self.record)
        if name == "backtest" and stage["status"] != "failed" and stage["artifacts"]:
            cli.promote_candidate(stage, gate, files)
            run_record.write_record(self.record)

        # 입력은 실행 직전, 출력은 게이트 직후의 해시로 저장해 나중의 변경과 분리한다.
        snapshot = {"inputFiles": inputs, "outputFiles": outputs}
        self.snapshots[name] = snapshot
        write_json(
            paths.REPORTS / "runs" / self.record["runId"] / "lineage.json",
            {
                "schemaVersion": 1,
                "runId": self.record["runId"],
                "dagsterRunId": self.dagster_run_id,
                "stages": self.snapshots,
            },
        )
        return stage, snapshot

    # 검사 실패 때 하류는 pending을 유지하고 예외로 끊긴 실행은 성공으로 확정하지 않는다.
    def finish(self) -> None:
        failed = any(stage["status"] == "failed" for stage in self.record["stages"])
        if not failed:
            interrupted = next(
                (
                    stage
                    for stage in self.record["stages"]
                    if stage["name"] in self.selected and stage["status"] in {"pending", "running"}
                ),
                None,
            )
            if interrupted is not None:
                interrupted["status"] = "failed"
                interrupted["gate"] = {
                    "passed": False,
                    "message": "Dagster 실행이 단계 완료 전에 종료되었습니다",
                }
        run_record.finish_record(self.record, False, self.selected)
        run_record.write_record(self.record)


# 기본 외부 호출 예산을 CLI와 같은 0으로 두고 정상·검사 실패 모두 실행 기록을 확정한다.
@resource(config_schema={"max_calls": Field(Int, default_value=0, is_required=False)})
def pipeline_run(context: InitResourceContext) -> Iterator[PipelineRun]:
    dagster_run = context.run
    if dagster_run is None:
        raise ValueError("파이프라인 기록에는 Dagster 실행 컨텍스트가 필요합니다")
    selection = dagster_run.asset_selection
    step_keys = dagster_run.step_keys_to_execute
    selected = tuple(
        name
        for name in stages.STAGES
        if (
            AssetKey(["crowdcast", name]).to_python_identifier() in step_keys
            if step_keys is not None
            else not selection or AssetKey(["crowdcast", name]) in selection
        )
    )
    execution = PipelineRun(selected, context.resource_config["max_calls"], dagster_run.run_id)
    context.instance.add_run_tags(dagster_run.run_id, {"crowdcast/runId": execution.record["runId"]})
    try:
        yield execution
    finally:
        execution.finish()
