# Dagster 파이프라인과 계보 JSON

Dagster 1.13.24에서 기존 CLI의 `STAGES`와 `run_stage` → `execute_stage`, `promote_candidate`, `run_record`를 재사용한다. 데이터 처리·게이트·수집 재시도·승격 산식은 기존 코드가 맡는다. T-106의 요약·운영 API 파일은 변경하지 않는다.

## 실행과 화면

저장소 루트에서 이미 설치된 `pipeline` 의존성 그룹으로 실행한다.

```bash
uv run --package crowdcast-forecast --group pipeline dagster dev -m crowdcast.pipeline.dagster_defs
uv run --package crowdcast-forecast --group pipeline dagster definitions validate -m crowdcast.pipeline.dagster_defs
```

기본 주소는 `http://localhost:3000`이다. **Assets → Global asset lineage**에서 `crowdcast_pipeline` 그룹을 열면 `crowdcast/fetch → labels → features → train → backtest → batch → publish`가 보인다. 자산의 **Checks** 탭은 `gate` 판정·기존 메시지를, **Materializations**는 `runId`, `dagsterRunId`, `runRecord`, `inputFiles`, `outputFiles`, `rowCounts`, `ms`, `status`를 보여 준다. 각 출력 파일에는 상대 경로·SHA-256·행 수가 있다. 행 수는 Parquet·CSV·JSONL만 실측하며 비표 형식·읽기 실패는 `null`이다. publish의 별도 데이터 산출물은 CLI처럼 빈 배열이고 실행 기록 경로는 `runRecord`에 있다.

전체 실행은 Jobs의 `crowdcast_pipeline`을 수동 실행한다. 각 자산을 선택해 실행할 수도 있으며 선택 밖 단계는 CLI처럼 `skipped`로 기록한다. 정의 로딩·계보 조회만으로 단계나 외부 API를 실행하지 않는다. 공유 기록·호출 예산·시작 시점의 백테스트 기준을 유지하려고 전체 job과 UI 자산 job 모두 `in_process` 실행기를 쓴다.

스케줄 `crowdcast_daily_0600_kst`는 `0 6 * * *`, `Asia/Seoul`, **기본 STOPPED**다. UI에서 켜기 전에는 자동 실행하지 않는다. 이전에 사용자가 켠 상태는 Dagster 저장소에 남으므로 재시작으로 꺼지지는 않는다. 수동 실행과 스케줄의 기본 외부 호출 예산은 `0`이며, 수동 실행에 예산이 필요한 경우 Launchpad에 명시한다(팀 전체 일 1,000건 장부는 기존 수집기가 적용).

```yaml
resources:
  pipeline_run:
    config:
      max_calls: 0
```

게이트 `False`는 blocking ERROR check로 하류를 중단한다. `None`(미검증·진입점 부재)은 실패한 WARN check로 표시하고 CLI처럼 계속한다. 따라서 미검증 실행은 Dagster job이 성공해도 `run.json.status`는 `failed`일 수 있다. 운영 화면과 발행 가능 여부는 기존 실행 기록·게이트를 기준으로 읽는다. batch의 수량 감소 경고와 미검증 후보 승격도 기존 CLI 판정을 유지한다.

`reports/runs/<runId>/run.json`, `run.md`, `reports/runs/latest.json`은 기존 계약·원자 쓰기를 사용한다. `runId`는 기존 시간순 식별자이며 Dagster UUID와 다르다. Dagster run의 `crowdcast/runId` 태그로 연결한다. 프로세스를 강제 종료하면 CLI와 마찬가지로 진행 중 기록이 남을 수 있다. UI 스크린샷 `reports/figures/screens/T-108-lineage.png` 확인은 오케스트레이터가 맡는다.

## T-605 계보 내보내기

```bash
uv run --package crowdcast-forecast --group pipeline python -m crowdcast.pipeline.dagster_defs lineage --out reports/runs/lineage.json
```

출력은 `schemaVersion: 1`, `exportedAt`(KST ISO 8601), `assets`(STAGES 순서의 7개 객체)다. 각 자산의 형식은 다음과 같다.

| 필드 | 의미 |
|---|---|
| `key` | `crowdcast/<stage>` 문자열 |
| `deps` | 직전 자산 키 배열, fetch는 `[]` |
| `inputFiles` | `{path, sha256}` 배열. Dagster 단계 시작 직전 해시, 없는 입력은 `null` |
| `outputFiles` | `{path, sha256, rows}` 배열. 기존 실행 기록의 산출물 해시와 실행 때의 행 수 |
| `lastRunId` | 이 단계를 마지막으로 판정한 완료 실행 ID, 없으면 `null` |
| `dagsterRunId` | 해당 실행의 Dagster UUID, 기존 CLI 실행은 `null` |
| `status`, `gate` | 그 실행의 단계 상태·`{passed, message}`, 실행 기록이 없으면 `null` |

경로는 `data/`, `models/`, `reports/` 기준이며 공유 저장소의 절대 경로를 노출하지 않는다. 입력·출력 스냅샷은 별도 `reports/runs/<runId>/lineage.json`에 `{schemaVersion: 1, runId, dagsterRunId, stages: {<stage>: {inputFiles, outputFiles}}}`로 저장한다. 기존 `run.json` 계약에는 필드를 추가하지 않는다.

내보내기는 완료 기록을 시작 시각순으로 읽고, 실행 시간이 기록된 단계만 자산별 마지막 실행으로 선택한다. 실패·미검증도 증거로 남으며 상태와 함께 해석해야 한다. 하류가 중단되면 그 자산은 이전 실행을 가리킨다. dry·진행 중 기록은 제외한다. 파일이 나중에 바뀌거나 없어져도 저장된 실행 해시는 유지한다. sidecar 없는 CLI 기록은 출력 해시만 복원하고 입력 경로는 현재 `input_files` 목록, 입력 해시·행 수는 `null`이다. 실행 기록이 없는 자산은 현재 알려진 입력·존재하는 출력 경로만 표시하며 해시는 `null`이다. 깨진 실행 기록이나 sidecar의 버전·runId 불일치는 오류로 종료하며 기존 출력 파일을 덮어쓰지 않는다.

검증은 `uv run --package crowdcast-forecast --group pipeline pytest -q services/forecast/tests`와 `uv run --package crowdcast-forecast --group pipeline ruff check services/forecast/src/crowdcast/pipeline/dagster_defs services/forecast/tests/pipeline/dagster`로 실행한다. 새 테스트는 가짜 단계로만 materialize하고 공유 데이터나 외부 API를 사용하지 않는다.

참조: Dagster 1.13 [자산](https://docs.dagster.io/api/dagster/assets), [blocking 검사](https://docs.dagster.io/api/dagster/asset-checks), [Definitions](https://docs.dagster.io/api/dagster/definitions), [스케줄](https://docs.dagster.io/api/dagster/schedules-sensors), [CLI](https://docs.dagster.io/api/clis/cli).
