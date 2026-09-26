# QA-1-web: 전체 QA에서 나온 웹 문제 고치기 — e2e 3개 실패 + 묶음 리뷰(High 1·Med 3)
- 레인/워커: L4a / gpt-6-sol        - 선행: develop 2a967fb(T-406·T-407b·T-433b·T-430b·T-434a 병합)
- 목표(한 문장): 합친 뒤 처음 전체로 돌린 e2e에서 **매번** 실패하는 3개와 묶음 리뷰(`.harness/reports/QA-web.review.md`)의 지적을 고친다 — 기능 추가 없이 고치기만.
- 허용 경로(QA 한 번만 — 레인 경계 없이): `apps/web/src/`, `tests/e2e/`
- 고칠 것:
  1. **e2e `s3.spec.ts:18` 실패**: docx 다운로드 이름이 `export.docx`(기대 `plan-yeongjong.docx`) — 요청이 테스트의 가짜 경로에 안 걸리고 Vite 프록시(8787, 꺼짐)로 나간다. 앱이 실제로 쓰는 경로(`POST /api/forecasts/{id}/plan` → `docxHref` `/api/plans/{id}/export.docx`)와 테스트의 가짜 경로·Content-Disposition을 맞춘다.
  2. **리뷰 High `report-toolbar.tsx:44`**: docx 버튼이 `brief.actions`의 `id === "plan"`을 찾아 실제 예보서에서는 영원히 비활성 → 발행 스냅샷이 보이면 버튼을 켜고, `POST /api/forecasts/{id}/plan` 결과(404·502·오류)로만 비활성·이유를 정한다.
  3. **e2e `s1.spec.ts:134` 실패**: 목록 포커스에서 ↓ 뒤 카메라 target이 바뀐다 — 목록의 `preventDefault()`(T-407b)보다 카메라 키 처리(T-433b)가 먼저 받는다. 카메라는 **장면 컨테이너에 포커스가 있을 때만** 반응하게(전역 keydown이면 `event.target`이 장면 안인지 확인) 고친다.
  4. **e2e `s1-panels.spec.ts:92` 실패**: SVG 지역 `path` 클릭이 30초 대기 — 다른 요소(합친 뒤의 패널·"전국 보기" 버튼·범례 등)가 덮는지 확인해 겹침을 없앤다(`forceSvg=1` 화면).
  5. **리뷰 Med `report-drawer.tsx:87`**(화면 숫자 오류): 데이터 근거 카드가 `datasetId`만 보고 첫 관측값을 붙여 외지인 비율 카드에 일평균 인원이 찍힌다 → 근거가 가리키는 관측(`quantityIds`·관측 id)과 정확히 연결된 값만 보이고, 불명확하면 수치를 보이지 않는다.
  6. **리뷰 Med `report-numbers.tsx:32`**: 일평균 수치의 근거 칩이 claim 자리표시자에서만 찾아져 비어 있다 → 스냅샷 `evidence[].quantityIds`로도 연결.
  7. **리뷰 Med `trains.tsx:84`·`road-traffic.tsx:119`**: 데이터 모드에서 타일이 높아지면 열차·차가 땅속에 묻힌다 → 데이터 모드에서는 움직임 레이어를 숨긴다(범례에 한 줄 — 간단한 쪽).
- 수용 기준: `npm -w apps/web test`·`build`·`lint`·색 하드코딩 0, **e2e 전체 51개 통과**(`cd apps/web && npx playwright test` — 워커 샌드박스에서 못 돌리면 구문만, 실행은 오케스트레이터), 고친 항목마다 단위 또는 e2e 회귀 1개.
- 코드 규칙: AGENTS.md §5. **구현 우선 모드** — 다른 곳을 다듬지 않는다.
