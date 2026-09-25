## QA-1-web 결과: DONE

- 변경 파일: [docx 버튼](/home/data/crowdcast-wt/L4a/apps/web/src/features/forecast-report/report-toolbar.tsx), [수치 근거](/home/data/crowdcast-wt/L4a/apps/web/src/features/forecast-report/report-numbers.tsx), [관측 근거 카드](/home/data/crowdcast-wt/L4a/apps/web/src/features/evidence/report-drawer.tsx), [카메라](/home/data/crowdcast-wt/L4a/apps/web/src/components/scene/camera-rig.tsx), [데이터 모드 장면](/home/data/crowdcast-wt/L4a/apps/web/src/components/scene/mini-korea-canvas.tsx), [범례](/home/data/crowdcast-wt/L4a/apps/web/src/components/scene/scene-legend.tsx) 및 대응 단위·e2e 테스트.
- 수용 기준: 웹 테스트 **178개 통과**, build·lint 통과, 색 하드코딩 0건. e2e 51개는 구문·목록 검증 통과. 전체 실행은 샌드박스의 로컬 포트 바인딩 `EPERM`으로 시작되지 못했습니다.
- 의존성 변경: 없음
- CONTRACT-CHANGE: 없음
- BLOCKED: 없음
- 남은 일·주의: 오케스트레이터 환경에서 `cd apps/web && npx playwright test`로 51개를 실행해야 합니다. SVG 클릭 실패는 패널 겹침이 아니라 종로구 경계 상자 중앙이 이웃 지역에 놓이는 문제여서, 회귀 테스트가 실제 보이는 지역 면을 누르도록 수정했습니다.