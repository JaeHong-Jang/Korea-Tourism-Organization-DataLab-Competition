# services/gateway — TypeScript 게이트웨이 + 예보팀 (레인 L3, Codex gpt-6-astra)

- 스택: Node 22 + Hono, Ajv 2020(계약 검증), TypeScript strict, Vitest, Biome
- 현재 구현: `/api/health`, forecast·knowledge·records 클라이언트, 응답 계약 검증
- 후속 구현: 예보팀 런타임·게이트·트레이스·SSE·LLM 호출(T-302 이후)
- 설계: `docs/plan/10_예보팀_에이전트_구조.md`, `docs/plan/05_기술_아키텍처.md` §4·§8
- 폴더: `src/routes/`(라우트), `src/clients/`(서비스 호출), `src/contract/`(계약 등록·검증), `tests/`
- 코드 규칙: `AGENTS.md` §5

레포 루트에서 `npm -w services/gateway run dev`로 실행한다. `scripts/dev.mjs`는 `.env`를 읽어 환경 변수로 넘긴다. 단독 실행은 현재 프로세스의 환경 변수와 아래 기본값을 사용한다.

| 환경 변수 | 기본값 |
|---|---|
| `GATEWAY_PORT` | `8787` |
| `FORECAST_URL` | `http://127.0.0.1:8010` |
| `KNOWLEDGE_URL` | `http://127.0.0.1:8020` |
| `RECORDS_URL` | `http://127.0.0.1:8030` |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` |

상태 확인은 백엔드 `/health` 세 곳과 Ollama `/api/version`을 병렬로 호출한다. 각각 2초 제한이며 실패한 서비스는 `ok: false`로 표시한다. HTTP 응답은 항상 200이고 `services`와 `ollama`를 분리한다. `latencyMs`는 실패한 요청도 포함한 실제 대기 시간이다.

도메인 클라이언트는 기본 10초 안에 JSON 본문을 읽고 `@crowdcast/contracts/schemas/*`의 계약 검증을 마친 응답만 반환한다. 생성 타입은 `@crowdcast/contracts/types`를 사용한다. HTTP 오류는 `ServiceHttpError.status`로 구분하며 응답 수치나 근거를 보정하지 않는다. 생성 시 `fetch`와 `timeoutMs`를 주입할 수 있다.

검증 명령은 `npm -w services/gateway test`, `npm -w services/gateway run build`, `npm -w services/gateway run lint`다. 테스트는 가짜 fetch와 계약 픽스처를 사용하며 실제 백엔드나 Ollama를 호출하지 않는다.
