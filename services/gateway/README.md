# services/gateway — TypeScript 게이트웨이 + 예보팀 (레인 L3, Codex gpt-6-astra)

- 스택: Node 22 + Hono, `ollama` 클라이언트(로컬 LLM), Ajv(계약 검증), better-sqlite3
- 역할: 웹의 유일한 API 창구, 예보팀 런타임(팀장 + 분석·검증·보고 3팀 × 4명), 게이트, 트레이스, SSE, forecast·knowledge·records 호출
- 설계: `docs/plan/10_예보팀_에이전트_구조.md`, `docs/plan/05_기술_아키텍처.md` §4·§8
- 폴더: `src/routes` `src/team/{lead,analysis,verification,report,runtime}` `src/clients` `src/llm` `evals/`
- 코드 규칙: `AGENTS.md` §5
