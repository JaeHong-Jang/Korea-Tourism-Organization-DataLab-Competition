# QA-3-web: T-442(떠다니는 고래 봇·패널) 통합 뒤 e2e 10개 실패 — 겹침·중복 요소·테스트 갱신
- 레인/워커: L4a / gpt-6-sol        - 선행: develop 816cf7c(T-442·T-441 병합)
- 목표(한 문장): 고래 봇·대화 패널이 모든 화면에 붙으면서 생긴 **실제 겹침 버그**를 고치고, 새 흐름에 맞지 않는 테스트를 갱신해 기능 e2e를 다시 전부 통과시킨다.
- 실패 목록(오케스트레이터 실행, 자세한 오류는 이 워크트리의 `apps/web/test-results/*/error-context.md`):
  1. `a11y.spec.ts` "S2 상담 시작과 완료" — 예시 버튼(`/영종 씨사이드파크에서/`) 클릭 시간 초과(패널·봇이 가리거나 S2에서 예시 칩이 사라짐)
  2. `assistant.spec.ts` "봇에서 행사 선택 뒤 예보서 미리보기" — `getByLabel('다가오는 행사에서 고르기')`가 2개(S2 화면과 패널에 같은 이름) → 이름을 구분하거나 한 곳만
  3. `qa-2-web.spec.ts` "구간 막대" — 클릭 시간 초과(봇이 가림 추정)
  4. `qa-2-web.spec.ts` "모델 카드" — 한계 요약 줄 수 6 기대인데 1(오케스트레이터가 "카드에 기록 없음" 줄을 빼도록 바꿈 — 픽스처 notes에 맞게 기대값 갱신)
  5. `s1.spec.ts` "견본 선택, 해제, 상담 입력, 데이터 모드" — `visibleTagsAreSafe` 시간 초과(이름표 안전 영역 계산에 봇·패널을 넣지 않았거나 봇이 이름표를 가림)
  6. `scene.spec.ts` "WebGL2 대체 안내" — WebGL 없을 때 대체 목록이 0개(봇의 WebGL 캔버스가 대체 판정을 깨뜨림 추정 — WebGL이 없으면 봇은 그림 버튼으로)
  7~9. `scene.spec.ts` DPR 3개 — `locator('canvas')`가 2개(장면 + 봇) → 장면 캔버스로 한정
  10. `t435b.spec.ts` "상담 말풍선의 자리표시자 숫자" — 상담 흐름 클릭 시간 초과(새 패널 흐름으로 갱신)
- 고칠 원칙: **봇·패널은 떠 있는 패널 경계 캐시(`scene-panel-bounds`)와 이름표 안전 영역에 포함**하고, 패널이 열려도 주요 버튼(구간 막대의 값 표 보기 등)을 가리지 않게(패널이 열리면 본문 폭을 줄이거나 패널을 오른쪽 칸으로), 봇 버튼은 본문 조작 요소와 겹치지 않는 자리(가리면 자동으로 위로 비킴). WebGL이 없으면 봇은 고래 그림 버튼(캔버스 없음). 같은 역할의 컨트롤이 두 곳에 있으면 접근 이름을 다르게("…(패널)").
- 허용 경로: `apps/web/src/features/{assistant,consult-chat,validation}/`, `apps/web/src/components/scene/{scene-panel-bounds,tag-visibility}.ts`(봇·패널 경계 포함만), `apps/web/src/pages/consult-page.tsx`, `apps/web/src/app/`, `apps/web/src/styles/`, `tests/e2e/`(해당 스펙 갱신 — `screens-v2.spec.ts`의 S2 부분도 새 화면에 맞게)
- 수용 기준: `npm -w apps/web test`·build·lint·색 하드코딩 0. e2e는 오케스트레이터가 다시 돌린다(기능 98개 + 스크린샷 132개 목표).
- 코드 규칙: AGENTS.md §5. **구현 우선 모드**.
