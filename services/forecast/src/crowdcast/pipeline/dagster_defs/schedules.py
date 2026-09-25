"""매일 한국 시각 06시 전체 실행을 기본 중지 상태로 정의한다."""

from dagster import (
    AssetSelection,
    DefaultScheduleStatus,
    ScheduleDefinition,
    define_asset_job,
    in_process_executor,
)

# 전체 실행과 UI의 개별 실행 모두 같은 프로세스에서 순서와 호출 예산을 보존한다.
pipeline_job = define_asset_job(
    "crowdcast_pipeline",
    selection=AssetSelection.groups("crowdcast_pipeline"),
    executor_def=in_process_executor,
    description="fetch부터 publish까지 기존 CLI 단계·게이트를 실행한다",
)
daily_schedule = ScheduleDefinition(
    name="crowdcast_daily_0600_kst",
    job=pipeline_job,
    cron_schedule="0 6 * * *",
    execution_timezone="Asia/Seoul",
    default_status=DefaultScheduleStatus.STOPPED,
    run_config={"resources": {"pipeline_run": {"config": {"max_calls": 0}}}},
)
