# services/gateway — TypeScript 게이트웨이 + AI 에이전트 (레인 L3, Codex gpt-6-astra)

- 스택: Node 22 + Hono, `ollama` 클라이언트(로컬 LLM), Ajv(계약 검증), better-sqlite3
- 역할: 웹의 유일한 API 창구, 예보 워크플로·의도 라우터·가드·트레이스·SSE, forecast·records 호출
- 설계: `docs/plan/05_기술_아키텍처.md` §3(에이전트) §4(API)
- 폴더: `src/routes` `src/agent/{steps,intents,guards,plan/sections,prompts}` `src/clients` `src/llm` `evals/`
- 코드 규칙: `AGENTS.md` §5
