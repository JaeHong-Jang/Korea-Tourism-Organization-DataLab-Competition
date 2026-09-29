# hy·sj 통합 및 동섭 지도 반영

## 반영 기준

- 기준 develop: `6e0bedd5da27f6776bb4ad84af304dc56b120f43`
- hy 전체: `253a083558e4e07a6f0eaca07d60b791e328dde9`
- sj 전체: `92c79933d3a9e12150ebd8ad43aed5bc313eb883`
- 지도·3D: `develop_Dongseop`의 `4c48cb55de9d2801b99952f1e4a13ee87b85dff1`

## 통합 결과

운영 화면·메뉴·전용 컴포넌트를 삭제하고 `/ops`를 `/insights`로 연결했다. hy의 내 행사·예보 근거·모델 검증과 sj의 인사이트·방문객 비교·예측을 유지했다.

지도는 `components/scene/`, `features/mini-korea/`, `pages/mini-korea-page.tsx`, `lib/theme/theme-provider.tsx`를 동섭 브랜치와 동일하게 반영했다. 필요한 `polygon-clipping@0.15.7` 및 잠금 파일도 반영했다. 동섭 브랜치의 상담 화면·기록 서비스 변경은 이번 통합에 포함하지 않았다. hy의 다른 3D 화면(근거 그래프·예보서 행사장)은 유지했다.

앱 라우트·접근성 테스트의 텍스트 충돌과 운영 페이지·스타일의 수정/삭제 충돌을 해결했다. 삭제한 운영 화면을 기대하던 근거 탐색 테스트를 갱신하고, 이전 운영 주소의 이동 검사를 추가했다. sj의 서식 오류 3개를 정리했다.

## 검증

- `npm -w apps/web run build`: 통과. 번들 크기 경고가 있다.
- `npm -w apps/web run lint`: 통과. 기존 CSS 규칙 경고 33개가 남는다.
- `npm -w apps/web test`: 329개 통과.
- `npm -w packages/contracts run check`: 스키마 32개·픽스처 141개, 오류 0개.
- `UV_NO_SYNC=1 npm test`: contracts·knowledge·gateway·records·web·graph 통과. forecast는 임시 공간의 DuckDB spatial 확장 누락으로 194개 실패했다.
- 확장 캐시를 준비한 후 `uv run --no-sync --package crowdcast-forecast pytest -q services/forecast/tests`: 1,822개 통과·1개 건너뜀. 전체 명령 자체를 성공으로 기록하지 않고 실패한 서비스의 재실행 결과를 구분한다.
- knowledge 340개, gateway 1,145개(1개 건너뜀), records 43개(505 assertions), 구현 그래프 106개 노드 정상.
- E2E 1차: `s1.spec.ts scene.spec.ts s6-s7.spec.ts app-shell.spec.ts --workers=2`: 33개 통과·1개 시간 초과. 지도·상담 연결 재검사와 새 운영 주소 검사: 2개 통과.
- E2E 2차: `a11y.spec.ts forecast-evidence.spec.ts graph.spec.ts s3.spec.ts s5.spec.ts --workers=2`: 15개 통과·1개 실패. 운영 메뉴 삭제에 맞춰 테스트를 수정한 뒤 `forecast-evidence.spec.ts --workers=1`: 4개 통과.
- 서로 다른 브라우저 시나리오 51개가 재검사 포함 모두 통과했다. 첫 실행의 지도·상담 연결 시간 초과는 재실행에서 통과했으며 간헐적 실행 지연 가능성은 남는다.
- 지도와 인사이트 오류 상태 스크린샷을 직접 확인했다. E2E는 가짜 API를 사용하며 실제 서비스 데이터 연결은 검증하지 않았다.
- `git diff --check`, `git diff --cached --check`: 통과.

## 작업 공간과 후속 작업

원래 develop 작업 공간의 package.json·package-lock.json 및 미추적 보고서는 변경하지 않았다. 시군구 경계 파일과 DuckDB 확장 캐시는 임시 검증 환경에서만 준비했으며 커밋에 포함하지 않는다.

`CONTRIBUTING.md`의 PR 생성 절차에 따라 팀원 최소 1명 리뷰 후 develop에 병합한다. 이번 브랜치에는 hy·sj의 병합 이력을 유지하고 동섭 지도는 선택 반영하므로, 동섭의 나머지 작업은 후속 통합 대상으로 남는다.
