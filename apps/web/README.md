# apps/web — React 프론트엔드 (레인 L4a 상담·근거 / L4b 대시보드 / L4c 3D·펫, Codex gpt-6-sol)

- 스택: React + Vite + TypeScript, Tailwind CSS v4 + shadcn/ui, React Three Fiber(3D 미니 대한민국), Recharts, React Flow(근거 지도), TanStack Query, MapLibre(2D 대체)
- 화면 S1~S8: `docs/plan/03_제품_기획서.md` §5 / 디자인 토큰·컴포넌트: `docs/plan/04_디자인_시스템.md`
- 폴더: `src/app` `src/pages` `src/features/<기능>` `src/components/{ui,charts,common,scene,pets}` `src/lib` `src/styles` — 소유 레인은 `AGENTS.md` §2
- API는 게이트웨이(`/api/*`)만 부르고, 화면 숫자는 API JSON을 그대로 표시한다
- 코드 규칙: `AGENTS.md` §5 (파일·문단 한 줄 주석, 기능별 파일 분리)
