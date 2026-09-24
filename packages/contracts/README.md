# packages/contracts — 서비스 간 계약 (오케스트레이터 소유, 워커는 읽기 전용)

- `schemas/*.schema.json`: JSON Schema 2020-12 정본(event, forecast, judgment, plan, ledger-entry, sse-event …)
- `openapi/{gateway,forecast,records}.yaml`: 서비스별 OpenAPI 3.1(스키마를 `$ref`로 참조)
- `sse-events.md`, `design-tokens.css`, `fixtures/`, `generated/`(TS 타입·pydantic 생성물)
- 재생성: `npm run contracts:gen` / 변경 제안은 워커 리포트의 `CONTRACT-CHANGE:`로
- 설계: `docs/plan/05_기술_아키텍처.md` §5
