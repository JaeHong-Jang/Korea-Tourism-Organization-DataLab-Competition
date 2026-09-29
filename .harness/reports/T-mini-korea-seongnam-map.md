## T-mini-korea-seongnam-map 결과: DONE

- 변경 파일: `components/scene/national-map/`(투영된 실제 지도 로더·형상·카메라·표식·군중·검사), `mini-korea-canvas.tsx`, `land-tiles.tsx`, `use-land-model.ts`, `projection.ts`, `scene-legend.tsx`, `features/mini-korea/map-toolbar.tsx`, `map-mobile-tools.tsx`, `mini-korea.css`, `pages/mini-korea-page.tsx`, 지도 안내 문서, task/report.
- 구현: 성남 지도와 같은 정사영 건물·도로·녹지 표현, 전국→동네 연속 확대, 이동/회전/커서 확대/두 손가락/위에서 보기/전국 복원, 17개 시도·252개 시군구 이동, 기존 행사 선택과 요약 연결, 네모 받침 제거. 실제 예보값·모델·검증·기록 API는 변경하지 않았다.
- 수용 기준: `npm.cmd -w apps/web run build` → TypeScript·Vite 성공(기존 대형 번들 경고 존재).
- 수용 기준: `npm.cmd -w apps/web test -- --run src/components/scene/national-map src/components/scene/__tests__/projection.test.ts src/components/scene/__tests__/crowd.test.ts` → 5개 파일 25개 검사 통과. Windows 샌드박스의 상위 경로 접근 오류 후 동일 명령을 승인된 제한 밖 실행으로 확인했다.
- 수용 기준: 앱 폴더에서 Biome `check --formatter-enabled=false --assist-enabled=false`로 변경 TS 파일과 새 지도 폴더 검사 → 24개 파일 lint 통과. 전체 저장소 formatter 실행은 하지 않았다.
- 수용 기준: `node reports/runs/mini-korea-map/final-check.mjs` → Chromium 1440×960 및 터치 390×844 성공. 성남 z15 건물 조각 2,875개, 부산 z14 101개, 제주 z14 41개 로딩을 확인했다. 드래그 표적 이동·회전·북쪽 위 보기·행사 선택·전국 복원·휴대전화 확대·두 손가락 확대·가로 넘침 없음 확인. 전체 과정 canvas 1개 유지, 브라우저 error 0개. 행사 값은 명시적 견본 데이터, 지도 형상은 실제 로컬 PMTiles다.
- 증거: `reports/runs/mini-korea-map/final-result.json`, `final-national.png`, `final-seongnam.png`, `final-busan.png`, `final-jeju.png`, `final-mobile.png`, `final-mobile-pinch.png`(git 제외 실행 산출물).
- 읽기 전용 검토: High 없음. 같은 타일 내 표식 갱신, 버퍼 형상 중복, 해안 건물 stencil 잘림 Med 3개 모두 보완하고 빌드·단위·브라우저 검사를 다시 실행했다.
- 의존성 변경: 없음.
- CONTRACT-CHANGE: 없음.
- BLOCKED: 없음.
- 남은 일·주의: 전국 z13/z15 원본은 100MB 이상 git 제외 파일이므로 다른 컴퓨터·배포 환경에는 별도로 공유해야 한다. 건물 높이·도로 폭 누락과 사람·차량 연출의 한계는 화면 출처/범례에 표시했다. 작업은 `develop_hy` 작업 트리에 남겼으며 이 요청에서 커밋·푸시는 수행하지 않았다.
