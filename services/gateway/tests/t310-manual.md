<!-- T-310의 조회 프록시 수용 기준과 실제 서비스 중계 결과를 기록한다 -->
# T-310 검증 기록

2026-09-25 KST. gateway는 L3 작업 트리, knowledge·records는 본 레포의 develop 소스로 실행했다(develop HEAD `5592d7f`). 본 레포에 진행 중인 계약·문서 변경이 있었으며 이 작업에서는 수정하지 않았다. 기본 8787 포트의 기존 프로세스와 충돌하지 않도록 수동 확인은 gateway 18877, knowledge 18020, records 18030을 사용했다.

`CROWDCAST_DATA_ROOT`를 실행마다 만든 `/tmp/crowdcast-t310-manual-*`로 지정했다. knowledge는 본 레포 `.venv/bin/python -m uvicorn knowledge.api.app:app`, records는 `php -S 127.0.0.1:18030 -t services/records/public`, gateway는 L3의 `tsx src/index.ts`로 실행했다. Python 바이트코드 쓰기를 껐으며 의존성을 설치하지 않았다. forecast 주소는 서비스가 없는 `http://127.0.0.1:18010`으로 지정했다.

## 실제 curl 확인

records의 실제 저장 API로 계약 픽스처 `event/valid-yeongjong.json`, `forecast-report/valid-yeongjong.json`을 임시 DB에 넣었다. 각각 HTTP 200이었다. develop의 `PlanFixture::example()`으로 만든 계획을 게이트웨이 `POST /api/records/plans`로 저장했고 HTTP 200이었다. 테스트용 행사와 계획이며 실제 발행 자료를 추가한 것이 아니다.

```bash
curl -i http://127.0.0.1:18877/api/evidence/stats
curl -i http://127.0.0.1:18877/api/records/ledger/verify
curl -D /tmp/t310-docx.headers -o /tmp/t310-plan.docx \
  http://127.0.0.1:18877/api/records/plans/plan-yeongjong-example/export.docx
curl -i http://127.0.0.1:18877/api/festivals
curl -i 'http://127.0.0.1:18877/api/weather?lat=37.49&lng=126.58&at=2025-10-18T19%3A00%3A00%2B09%3A00'
curl -i http://127.0.0.1:18877/api/validation/backtest
curl -i http://127.0.0.1:18877/api/forecasts/f-yeongjong-2025
```

| 경로 | 결과 |
|---|---|
| `/api/evidence/stats` | 503. 실제 knowledge `/v1/stats/datalab-usage`가 아직 없어 직접 조회도 404였다. |
| `/api/records/ledger/verify` | 200, `{"valid":true,"count":0,"brokenAt":null}`. 임시 DB의 빈 원장이다. |
| `/api/records/plans/plan-yeongjong-example/export.docx` | 200, 10,717바이트, ZIP 시작 바이트 `504b0304`. |
| `/api/festivals` | 503, forecast 연결 없음. |
| `/api/weather?...` | 503, forecast 연결 없음. |
| `/api/validation/backtest` | 503, forecast 연결 없음. |
| `/api/forecasts/f-yeongjong-2025` | 503. records에 스냅샷을 저장했지만 id별 조회 API는 T-505 전이라 아직 없다. |

503의 본문은 모두 `{"code":"UPSTREAM_UNAVAILABLE","message":"상류 서비스 응답을 사용할 수 없습니다."}`였다. 상류 원문 오류나 대체 수치를 노출하지 않았다.

docx 응답 헤더:

```text
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="plan-yeongjong-example.docx"
SHA-256: 2e72944c51e7de96e86ccb02cd5bbb43d6d4f6602a6dc1d6469b82920903039a
```

검증 후 시작한 서비스와 임시 DB·다운로드 파일을 정리했다. 공유 데이터·평가·trace 산출물을 수정하지 않았다. 첫 수동 기동 확인은 health 응답의 최대 2초 대기보다 짧은 0.5초 탐색 제한 때문에 실패했다. 탐색당 3.5초, 전체 기동 대기 60초로 확인 스크립트를 수정한 후 위 결과를 얻었다.

## 자동 수용 기준

- `npm -w services/gateway test`: 28개 파일, 535개 테스트 통과. 이번 작업에서 259개 추가.
- 계약 위반 로그를 `CONTRACT_VIOLATION`으로 구분한 뒤 `npm -w services/gateway test -- proxy-records`: 91개 테스트 재확인, 통과.
- `npm -w services/gateway run build`: 통과.
- `npm -w services/gateway run lint`: 103개 파일 통과.
- `GATEWAY_PORT=18878 node scripts/dev.mjs --check --only gateway`: 종료 코드 0, `✓ gateway http://127.0.0.1:18878/api/health`.
- `git diff --check`: 통과.

가짜 상류 테스트는 모든 단일 조회 경로와 인사이트 I1~I6, records 허용 목록의 각 메서드를 대상으로 정상 응답·연결 거부·HTTP 404/503·계약 위반을 확인한다. 행사 필터 조합, 필터에서 제외될 행의 계약 위반, 잘못된 요청의 400, 목록 밖 records 경로의 404, PUT 충돌의 409, 인코딩된 경로 우회 차단, docx 헤더·바이트 보존, 연결과 본문 읽기의 5초 제한도 포함한다. 집계 조회는 각 상류를 개별적으로 실패시켜 검증하며 평가 파일 없음·깨진 파일·음수 평가 수치도 확인한다.

## 구현 결정과 남은 연동

- `sido`는 두 자리 시도 코드 또는 `sigunguName`의 첫 시도 이름을 받는다. 이름은 특별시·광역시·특별자치시·특별자치도·도 접미사를 제외해 비교한다. `28`, `인천`, `인천광역시`를 검증했다. `type`·`level`과 AND로 결합하며 `from`·`to`만 상류에 전달한다.
- `sessionId` 쿼리는 아직 gateway·knowledge 계약에 없으므로 전달하지 않는다. 여러 세션의 같은 근거 id가 모호해 knowledge가 404를 반환하면 gateway는 503을 반환한다. 세션 문맥 지원은 계약 결정 이후 작업이다.
- 데이터랩 명세는 원래 행과 순서를 유지하며 `datasetId`가 같은 knowledge 항목의 `count`를 붙인다. 일치 항목이 없으면 `null`, 명시된 0은 0이다. knowledge 호출 실패나 계약 위반은 503이다.
- `ops-status`는 모델·그래프·최신성 배열 자체에 `null`을 허용하지 않는다. 이 상류가 실패하면 503이며, 최신성 항목의 수집 시각·관측일·행 수와 없는 평가 파일에만 계약의 `null`을 유지한다.
- 최신 평가는 작업 디렉터리와 무관하게 레포 `reports/evals/latest.json` 공유 링크에서 읽고 `ops-status#/$defs/evalSummary`로 검증한다. 존재하지만 잘못된 파일은 503이다.
- 경계의 현재 응답 계약은 `type: object`다. 게이트웨이는 이 계약 범위로 검증하며 TopoJSON 내부 구조를 새로 정의하지 않는다.
- forecast 조회 구현, knowledge 통계 구현, records의 id별 스냅샷 조회(T-505)가 연결되면 같은 계약 검증을 거쳐 전달된다.

## 변경 파일

- `services/gateway/src/app.ts`: 라우트 import·등록.
- `services/gateway/src/routes/`: `festivals.ts`, `regions.ts`, `forecasts.ts`, `evidence.ts`, `weather.ts`, `validation.ts`, `insights.ts`, `ops.ts`, `records-relay.ts`, `proxy-response.ts`.
- `services/gateway/src/clients/`: `records-client.ts` 조회 추가, `forecast-queries.ts`, `knowledge-queries.ts`, `query-schemas.ts`, `regions-client.ts`, `records-relay-client.ts`, `eval-reader.ts` 추가.
- `services/gateway/tests/`: `proxy-fixture.ts`, `proxy-queries.test.ts`, `proxy-filters.test.ts`, `proxy-records.test.ts`, `proxy-aggregates.test.ts`, `eval-reader.test.ts`, `t310-manual.md` 추가.

의존성 변경·계약 파일 변경·git 조작 없음.

## 게이트 피드백 1회차 수정·재검증

2026-09-25. 교차 리뷰의 여섯 항목을 반영했다.

- 조회 응답은 HTTP 200만 성공으로 받는다. `redirect: "manual"`을 적용하고 201·206·301·302·307·308을 503으로 처리한다. 기존 계약의 오류 매핑은 유지한다.
- records JSON 응답은 `application/json`, docx는 계약 MIME을 확인한 뒤 읽는다. POST·PUT 요청도 JSON MIME을 본문 파싱 전에 확인한다. gateway 계약에 415가 없어 잘못된 요청 MIME은 400이다.
- JSON은 2 × 1024²바이트, docx는 20 × 1024²바이트로 제한한다. Content-Length뿐 아니라 실제 누적 바이트를 검사한다. 길이가 없는 docx도 초과 시 503을 반환할 수 있도록 상류 본문을 제한된 임시 파일에 먼저 받고, 검증이 끝난 파일을 64KiB 역압 기준으로 스트리밍한다. 다운로드 완료·오류·취소에 파일을 삭제한다. 상류의 5초 마감은 파일 수신까지 적용한다.
- 요청별 `signal`을 모든 조회·records 상류에 연결했다. 운영 상태·데이터랩 명세의 병렬 요청도 연결 종료 시 함께 중단한다. 모델·그래프 전체가 없는 경우의 503 및 계약상 null 조립 규칙은 유지한다.
- `c.req.raw.url`의 점 세그먼트도 거부한다. 설치된 `@hono/node-server` 2.1.1은 이 URL까지 정규화하므로 실제 서버에서는 `c.env.incoming.url`을 우선 검사한다. 실제 HTTP 요청의 `tmp/../ledger`, `tmp/%2E%2e/ledger`도 404를 확인했다.

최종 자동 검증:

- `npm -w services/gateway test`: 32개 파일, 683개 테스트 통과(기존 535개에서 148개 추가).
- `npm -w services/gateway run build`: 통과.
- `npm -w services/gateway run lint`: 108개 파일 통과.
- `GATEWAY_PORT=18878 node scripts/dev.mjs --check --only gateway`: 종료 코드 0, `✓ gateway http://127.0.0.1:18878/api/health`.
- `git diff --check`: 통과.

테스트 보강 중에는 닫힌 가짜 스트림의 취소 콜백 기대와 병렬 테스트의 공유 임시 디렉터리 관찰이 실패했다. 가짜 스트림의 미리 읽기를 끄고 임시 루트를 테스트별로 격리한 뒤 재검증했다. 본문 수신 중 취소·5초 마감, 다운로드 중 취소, 크기 초과 시에도 임시 파일 정리를 확인한다. 점 세그먼트, 리다이렉트 미추적, 브라우저 연결 종료는 실제 로컬 HTTP 서버로도 검증한다.

수동 재확인은 develop 작업 트리 HEAD `f254af9`의 knowledge·records와 수정된 L3 gateway로 실행했다. 다른 실행과의 충돌을 피하려고 최종 확인은 임의 포트 knowledge 50497·records 48637·gateway 39663을 사용하고, 직접 시작한 프로세스의 생존 여부도 확인했다. 데이터 루트는 `/tmp/crowdcast-t310-review-manual-*`, forecast 주소는 서비스 없는 48851이다. 행사·예보서·계획 픽스처 저장은 모두 200이었다.

| curl 경로 | 결과 |
|---|---|
| `/api/evidence/stats` | 503, `UPSTREAM_UNAVAILABLE`; 실제 knowledge `/v1/stats/datalab-usage` 직접 조회는 404 |
| `/api/records/ledger/verify` | 200, `{"valid":true,"count":0,"brokenAt":null}` |
| `/api/records/plans/plan-yeongjong-example/export.docx` | 200, 10,717바이트, ZIP 시작 바이트 `504b0304`, Content-Type·Content-Disposition 보존 |
| `/api/festivals`, `/api/weather?...`, `/api/validation/backtest` | 각각 503, `UPSTREAM_UNAVAILABLE` |
| `/api/records/tmp/../ledger`, `/api/records/tmp/%2E%2e/ledger` (`curl --path-as-is`) | 각각 404, `NOT_FOUND` |

재검증 docx SHA-256: `026bd4a0ba25de9e18302368d46eef85e0de7e0f1026d1bb620be6d1f2f1fff1`.

기동한 서비스와 임시 DB·다운로드·실패한 테스트의 임시 파일을 정리했다. 공유 실행 산출물을 변경하지 않았으며 의존성·계약·git 변경은 없다. 수정은 gateway 클라이언트 4개(크기 제한 파일 추가 포함), 프록시 라우트 10개, 관련 테스트·이 기록에 한정했다.

피드백 수정 파일 목록:

- `services/gateway/src/clients/`: `request-json.ts`, `regions-client.ts`, `records-relay-client.ts`, `records-response-body.ts`(추가).
- `services/gateway/src/routes/`: `proxy-response.ts`, `festivals.ts`, `regions.ts`, `forecasts.ts`, `evidence.ts`, `weather.ts`, `validation.ts`, `insights.ts`, `ops.ts`, `records-relay.ts`.
- `services/gateway/tests/`: `proxy-queries.test.ts`, `proxy-aggregates.test.ts`, `proxy-records.test.ts`, `proxy-docx.test.ts`(분리), `proxy-records-guards.test.ts`(추가), `proxy-records-size.test.ts`(추가), `proxy-http.test.ts`(추가), `t310-manual.md`.
