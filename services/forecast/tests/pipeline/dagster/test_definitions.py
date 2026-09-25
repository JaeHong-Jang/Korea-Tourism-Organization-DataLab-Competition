"""정의 로딩의 무실행성과 스케줄 기본 중지·한국 시각을 검증한다."""

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from crowdcast import paths
from crowdcast.pipeline import stages
from crowdcast.pipeline.dagster_defs import defs
from crowdcast.pipeline.dagster_defs.assets import pipeline_assets
from crowdcast.pipeline.dagster_defs.schedules import daily_schedule
from dagster import AssetKey, DefaultScheduleStatus, Definitions, build_schedule_context


# 정의 검증은 외부 호출이나 실행 기록 없이 자산·검사 일곱 쌍을 로딩한다.
def test_definitions_have_seven_assets_and_blocking_checks(pipeline_root: Path) -> None:
    Definitions.validate_loadable(defs)
    graph = defs.resolve_asset_graph()
    assert graph.get_all_asset_keys() == {AssetKey(["crowdcast", name]) for name in stages.STAGES}
    assert len(graph.asset_check_keys) == 7
    assert all(spec.blocking for asset in pipeline_assets for spec in asset.check_specs)
    assert defs.resolve_job_def("crowdcast_pipeline").executor_def.name == "in_process"
    assert defs.resolve_implicit_global_asset_job_def().executor_def.name == "in_process"
    assert not (paths.REPORTS / "runs").exists()


# 스케줄을 로딩하거나 다음 실행 요청을 평가해도 작업은 자동 시작되지 않는다.
def test_daily_schedule_is_stopped_and_has_zero_budget(pipeline_root: Path) -> None:
    assert daily_schedule.default_status == DefaultScheduleStatus.STOPPED
    assert daily_schedule.cron_schedule == "0 6 * * *"
    assert daily_schedule.execution_timezone == "Asia/Seoul"
    assert daily_schedule.job_name == "crowdcast_pipeline"
    context = build_schedule_context(
        scheduled_execution_time=datetime(2026, 9, 26, 6, tzinfo=ZoneInfo("Asia/Seoul"))
    )
    requests = daily_schedule.evaluate_tick(context).run_requests
    assert len(requests) == 1
    assert requests[0].run_config == {"resources": {"pipeline_run": {"config": {"max_calls": 0}}}}
    assert not (paths.REPORTS / "runs").exists()
