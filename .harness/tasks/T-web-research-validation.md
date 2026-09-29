# T-web-research-validation: 연구 모델 검증과 예보 근거 구분

- 사용자 승인: 2026-09-28, 새 실버 전체 후보 연구 결과를 웹의 모델 검증·예보 근거에 반영.
- 목표: 새 연구 후보와 현재 발행 모델을 혼동하지 않도록 실제 검증 수치·대상·한계를 화면에서 구분한다.
- 허용 경로: `apps/web/src/pages/{validation-page,knowledge-graph-page}.tsx`, `apps/web/src/features/validation/`, `apps/web/src/features/knowledge-graph/`, `apps/web/src/styles/`, `apps/web/src/**/*.test.tsx`, `.harness/tasks/T-web-research-validation.md`, `.harness/reports/T-web-research-validation.md`.
- 숫자 출처: `reports/backtest/silver-expansion-20260928/{summary,verification,fold_counts}.json`과 `docs/research/silver-expansion-20260928/results.md`.
- 요구: 새 모델은 시군구 일평균 방문 순증 연구 후보이며 발행 예보 미적용, 행사장 인원·순간 최대·안전 등급 미검증임을 명시한다.
- 요구: 2025·2026 고정 평가 MAE·포함률과 유형/SNR 대조를 보여주고, 큰 순증·명절 악화를 숨기지 않는다.
- 요구: 기존 API 백테스트와 산점도는 현재 발행 모델 기록으로 유지하고 새 결과와 섞지 않는다.
- 범위 밖: 계약·API·운영 모델·예보 계산·원본 데이터 변경, 커밋·푸시.
- 수용 기준: `npm.cmd -w apps/web test`, `npm.cmd -w apps/web run build`, `npm.cmd -w apps/web run lint` 통과.
