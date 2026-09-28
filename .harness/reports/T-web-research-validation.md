## T-web-research-validation 결과: DONE

- 변경 파일: `apps/web/src/pages/{validation-page,knowledge-graph-page}.tsx`, `apps/web/src/features/validation/{research-validation-data,research-validation-summary}.tsx`, `apps/web/src/features/knowledge-graph/research-model-evidence.tsx`, 관련 테스트와 `apps/web/src/styles/{pages,knowledge-graph}.css`.
- 모델 검증: 1,804건 signed 순증 연구의 학습 1,443·보정 361, 2025/2026 고정 평가 MAE·구간 포함률·대조군, 큰 순증·명절 악화를 표시. 연구 후보·발행 미적용과 순간 최대 미검증을 명시.
- 예보 근거: 연구 모델의 입력→예측값→시간순 검증→적용 범위를 먼저 표시하고, 선택한 예보서는 발행 당시 별도 모델 기록임을 명시.
- 수용 기준: `npm.cmd -w apps/web test` → 65개 파일, 301개 테스트 통과.
- 수용 기준: 연구 화면 전용 테스트 최종 재실행 → 2개 통과.
- 수용 기준: `npm.cmd -w apps/web run build` → TypeScript·Vite 빌드 통과. 기존 대형 번들 경고만 있음.
- 수용 기준: 변경 TS/TSX Biome 검사 → 오류·경고 없음. 전체 `npm run lint`는 기존 파일 줄바꿈/포맷 302건 때문에 실패하며 이번 변경과 무관함. CSS 포함 검사는 기존 파일의 specificity 경고를 포함해 경고만 발생.
- 수용 기준: 웹 표시 수치를 `summary.json`의 결정적 연구 산출물과 대조 → 일치. `git diff --check` 통과, 변경 TS 색 하드코딩 0건.
- 화면 확인: 1440×1000에서 `/validation`, `/graph`를 렌더해 카드·막대·모바일 대응 스타일을 확인. 스크린샷 `reports/figures/screens/research-{validation,evidence}.png`.
- 의존성·계약·API 변경: 없음.
- CONTRACT-CHANGE: 연구 검증 결과를 운영 API로 제공하려면 후속 계약 필드가 필요함. 이번 화면은 실행 ID가 고정된 공개 연구 결과를 표시함.
- BLOCKED: 없음.
- 남은 일·주의: 운영 모델은 바꾸지 않았으므로 기존 API 백테스트가 비어 있으면 현재 발행 모델 영역은 기존 빈 상태를 유지함.
