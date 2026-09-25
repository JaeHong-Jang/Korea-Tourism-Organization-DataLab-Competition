"""기존 단계 순서와 게이트 결과를 자산 및 하류 차단 검사로 변환한다."""

from crowdcast.pipeline import stages
from dagster import (
    AssetCheckResult,
    AssetCheckSeverity,
    AssetCheckSpec,
    AssetExecutionContext,
    AssetKey,
    AssetsDefinition,
    MaterializeResult,
    MetadataValue,
    asset,
)


# 모든 단계에 같은 어댑터를 적용해 처리 로직과 게이트를 기존 CLI에 맡긴다.
def stage_asset(name: str, previous: str | None) -> AssetsDefinition:
    key = AssetKey(["crowdcast", name])

    # None 판정은 CLI의 미검증 상태이므로 경고만 남기고 False 판정만 하류를 막는다.
    @asset(
        key=key,
        deps=[AssetKey(["crowdcast", previous])] if previous else [],
        group_name="crowdcast_pipeline",
        description=f"기존 crowdcast pipeline의 {name} 단계와 게이트",
        required_resource_keys={"pipeline_run"},
        check_specs=[AssetCheckSpec(name="gate", asset=key, blocking=True)],
    )
    def execute(context: AssetExecutionContext) -> MaterializeResult:
        execution = context.resources.pipeline_run
        stage, snapshot = execution.execute(name)
        gate = stage["gate"]
        metadata = {
            "runId": execution.record["runId"],
            "dagsterRunId": context.run.run_id,
            "runRecord": f"reports/runs/{execution.record['runId']}/run.json",
            "inputFiles": MetadataValue.json(snapshot["inputFiles"]),
            "outputFiles": MetadataValue.json(snapshot["outputFiles"]),
            "rowCounts": MetadataValue.json({item["path"]: item["rows"] for item in snapshot["outputFiles"]}),
            "ms": stage["ms"],
            "status": stage["status"],
        }
        return MaterializeResult(
            metadata=metadata,
            check_results=[
                AssetCheckResult(
                    passed=gate["passed"] is True,
                    asset_key=key,
                    check_name="gate",
                    severity=AssetCheckSeverity.WARN if gate["passed"] is None else AssetCheckSeverity.ERROR,
                    description=gate["message"],
                    metadata={**metadata, "gate": MetadataValue.json(gate)},
                )
            ],
        )

    return execute


# 별도 순서표 없이 CLI의 STAGES에서 직렬 의존을 만든다.
pipeline_assets = [
    stage_asset(name, stages.STAGES[index - 1] if index else None) for index, name in enumerate(stages.STAGES)
]
