"""기존 파이프라인 자산·게이트·수동 시작 스케줄을 Dagster에 공개한다."""

from crowdcast.pipeline.dagster_defs.assets import pipeline_assets
from crowdcast.pipeline.dagster_defs.execution import pipeline_run
from crowdcast.pipeline.dagster_defs.schedules import daily_schedule, pipeline_job
from dagster import Definitions, in_process_executor

# 한 실행의 기록·호출 예산·백테스트 기준을 모든 단계가 같은 프로세스에서 공유한다.
defs = Definitions(
    assets=pipeline_assets,
    resources={"pipeline_run": pipeline_run},
    jobs=[pipeline_job],
    schedules=[daily_schedule],
    executor=in_process_executor,
)
