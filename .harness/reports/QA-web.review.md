- [High] [report-toolbar.tsx:44](/home/data/crowdcast-run/apps/web/src/features/forecast-report/report-toolbar.tsx:44) — 실제 발행기의 `brief.actions`는 `check-*` 항목만 생성하므로 `id === "plan"` 조건이 성립하지 않습니다. 정상적인 계획 생성 API가 있어도 실제 예보서에서는 docx 버튼을 누를 수 없습니다. — 발행 스냅샷이면 요청을 허용하고, API 실패 응답으로 비활성 여부를 결정하세요.

- [Med] [report-drawer.tsx:87](/home/data/crowdcast-run/apps/web/src/features/evidence/report-drawer.tsx:87) — `datasetId`만 비교해 첫 관측값을 모든 해당 데이터 근거에 붙입니다. 실제 `region_daily_mean`, `nonlocal_share`, `weekend_ratio`는 같은 데이터셋이므로 외지인 비율 근거에도 일평균 인원과 단위가 표시됩니다. — 근거에 연결된 관측 ID까지 확인하고, 연결이 불명확하면 추가 수치를 표시하지 마세요.

- [Med] [report-numbers.tsx:32](/home/data/crowdcast-run/apps/web/src/features/forecast-report/report-numbers.tsx:32) — 자리표시자가 있는 발행 claim에서만 근거를 찾습니다. 기본 픽스처와 템플릿 예보에서는 일평균을 인용한 claim이 없어, 모델 근거가 존재해도 일평균 수치에 근거 칩이 없습니다. — 스냅샷의 `evidence[].quantityIds` 연결도 사용하세요.

- [Med] [trains.tsx:84](/home/data/crowdcast-run/apps/web/src/components/scene/motion/trains.tsx:84), [road-traffic.tsx:119](/home/data/crowdcast-run/apps/web/src/components/scene/motion/road-traffic.tsx:119) — 데이터 모드에서 타일은 높아지지만 노선·열차·차량은 기본 지면 높이에 고정됩니다. 2단계 타일의 표면은 `y=12`인데 열차 최상단은 `y=11.7`이어서 해당 구간에서 땅속에 가려집니다. — 데이터 모드의 타일 높이를 경로와 이동체 높이에 함께 반영하세요.

VERDICT: FAIL