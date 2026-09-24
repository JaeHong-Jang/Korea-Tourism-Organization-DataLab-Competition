# apps/web — React 프론트엔드 (레인 L4a 앱 셸·상담 / L4b 대시보드, Codex gpt-6-sol)

- 스택: React + Vite + TypeScript, Tailwind CSS v4 + shadcn/ui, MapLibre GL(Protomaps 로컬 타일), Recharts, TanStack Query
- 화면 S1~S8: `docs/plan/03_제품_기획서.md` §5 / 디자인 토큰·컴포넌트: `docs/plan/04_디자인_시스템.md`
- 폴더: `src/app` `src/pages` `src/features/<기능>` `src/components/{ui,charts,map,common}` `src/lib` `src/styles`
- API는 게이트웨이(`/api/*`)만 부르고, 화면 숫자는 API JSON을 그대로 표시한다
- 코드 규칙: `AGENTS.md` §5 (파일·문단 한 줄 주석, 기능별 파일 분리)
