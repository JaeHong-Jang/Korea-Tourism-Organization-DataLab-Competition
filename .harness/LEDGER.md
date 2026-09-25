# 작업 원장

| task | 워커 모델 | 상태 | 종료코드 | 게이트 1~4 | 리뷰 모델·결론 | 커밋 | 산출물 해시 |
|---|---|---|---|---|---|---|---|
| T-000 | Claude(오케스트레이터) | done | — | G1 ✓ · G2 check ✓ | — | 453732f | — |
| T-001 v1 | Claude(오케스트레이터) | 되돌림 | — | G2 check 27·오류 0 | gpt-6-astra R-01 1차 FAIL(High 9·Med 1) | caa098b | — |
| T-001 v1.1 | Claude(오케스트레이터) | 되돌림 | — | G2 check 27·41·오류 0 | gpt-6-astra R-01 2차 FAIL(High 1 + 부분 해결 4) | 7635e0a | — |
| T-001 v1.2 | Claude(오케스트레이터) | 되돌림 | — | G2 check 29·79·오류 0 | gpt-6-astra R-01 3차 FAIL(High 1·Med 4) | 8c5e2d2 | b55819206f3c |
| T-001 v1.3 | Claude(오케스트레이터) | 되돌림 | — | G2 check 29·101·오류 0 | gpt-6-astra R-01 4차 FAIL(High 1 회귀·Med 3) | 6d80b3b | — |
| T-001 v1.4 | Claude(오케스트레이터) | 되돌림 | — | G2 check 29·118·오류 0 | gpt-6-astra R-01 5차 FAIL(High 1·Med 2) | b34521b | — |
| T-001 v1.5 | Claude(오케스트레이터) | done | — | G2 check 29·128·오류 0 | gpt-6-astra R-01 6차 **PASS**(High 0·Med 1) | 0590c11 | — |
| T-001 v1.5.1 | Claude(오케스트레이터) | done | — | G2 check 29·129·오류 0 | R-01 6차 Med 1 반영(masterVersion 재검사) — 다음 교차 리뷰에서 확인 | (이 커밋) | — |
| T-401 | gpt-6-sol | done | 0 | G1 ✓ · G2 build·test 4·lint·e2e 10·스크린샷 9·Range 206 ✓ · G3 astra PASS(Med 4 이월) · G4 ✓(명세 코드 숨기기 이월) | gpt-6-astra PASS | d5db41a | 스크린샷 9장 해시는 reports/T-401.md |
| T-501 | gpt-6-sol | done | 0·0·0(3회) | G1 ✓ · G2 test 7·46·stan 0·우회 7종 거부 ✓ · G3 astra FAIL→FAIL→PASS · G4 ✓ | gpt-6-astra 3차 PASS | a288638 | — |
| T-201 | gpt-6-astra | done | 0 | G1 ✓ · G2 test 38·ruff·✓ forecast · G3 sol PASS · G4 ✓(PyYAML 의존성 명시는 통합에서) | gpt-6-sol PASS | f2b0916 | — |
| T-601 | gpt-6-astra | done | 0·0(2회: PARTIAL→후속) | G1 ✓ · G2 test 89·ruff·✓ knowledge · G3 sol PASS(판정 불일치 0/112) · G4 가정값 06 §4 대조 ✓ | gpt-6-sol PASS | a97cacd | — |
| T-301 | gpt-6-astra | done | 0 | G1 ✓(루트 lock 허용) · G2 test 42·build·lint·health 직접 확인 · G3 sol PASS · G4 ✓(.env 미로드 Med → T-302) | gpt-6-sol PASS | bbdab1f | — |
| T-100 | gpt-6-astra + 오케스트레이터 | done | 0·0·0 | G1 ✓ · G2 test 181·ruff·파이프라인 재현 · G3 sol FAIL→(피드백 2회)→직접 수정 3회 리뷰 · G4 1회차와 행 단위 대조 | gpt-6-sol(마지막 Med 반영) | 3f45a36 | parquet ae9238ac · qc 8d4e9bbe · diy 36a4551b |
| T-602 | gpt-6-astra | done | 0·0 | G1 ✓ · G2 test 222 · G3 sol FAIL→PASS(발행 전체 재검증) · G4 ✓ | gpt-6-sol PASS | 8277b4c | — |
| T-202 | gpt-6-astra | done | 0·0·0·0 | G1 ✓ · G2 test 185·영종 4등급·작은 행사 1등급 확인 · G3 sol FAIL→FAIL→PASS · G4 경계 표시 표 ✓ | gpt-6-sol PASS | 0edaa98 | — |
| T-502 | gpt-6-sol + 오케스트레이터 | done | 0·0·0 | G1 ✓(App.php 명세 확대) · G2 test 18·실서버 13/13 · G3 astra FAIL→FAIL→PASS · G4 모델 실행 판정 교정 | gpt-6-astra PASS | a16f946 | — |
| R-02 | 검토(gpt-6-sol) | done | — | 1차 FAIL→T-301 되돌림 · 2차 FAIL(dev.mjs) → 직접 수정 · 3차 PASS | gpt-6-sol PASS | — | — |
| T-430 | gpt-6-sol | done | 0 | G1 ✓(dev-page 하위 경로 명세 허용) · G2 test 20·build·lint · G3 astra PASS · G4 펫 디자인 시각 확인 | gpt-6-astra PASS | f16c214 | 스크린샷 해시 reports/T-430.md |
| T-503 | gpt-6-sol | done | 0·0 | G1 ✓(예시 CSV 공개 경로 제거) · G2 test 24·해시 Python 독립 재계산 · G3 astra FAIL→PASS | gpt-6-astra PASS | e3cd85f | — |
| T-302 | gpt-6-astra + 오케스트레이터(모델 결정) | done | 0·0 | G1 ✓(루트 lock) · G2 test 181·날짜·금액 경계 직접 재현 · G3 sol FAIL→PASS | gpt-6-sol PASS | a124d57 | 평가 MD 6efb0aa6 |
| T-603 | gpt-6-astra | done | 0 | G1 ✓ · G2 test 246 · G3 sol PASS · G4 ✓ | gpt-6-sol PASS | aa349dc | — |
| T-101 | gpt-6-astra + 오케스트레이터(벌크) | done | 0·0·0 | G1 ✓(픽스처 gitignore 예외) · G2 test 250·실호출·키 스캔 · G3 sol FAIL→PASS · G4 2026 코드 전환·반영 지연 발견·반영 | gpt-6-sol PASS | 895af8a | region_daily 861505행 3af83ecabebb |
| T-402 | gpt-6-sol | done | 0·0·0 | G1 ✓(이월 파일 승인 범위) · G2 test 69 · G3 astra FAIL→PASS · G4 차트 좌표·정직한 표시 확인 | gpt-6-astra PASS | b397251 | 스크린샷 해시 reports/T-402.md |
| T-431 | gpt-6-sol + 오케스트레이터(DPR) | done | 0·0·0 | G1 ✓ · G2 test 22·build·lint·e2e 7(새 DPR 테스트는 수정 전 실패 확인) · G3 astra PASS(Med 6)→FAIL(DPR 재적용)→직접 수정 PASS · G4 낮·노을·밤 스크린샷, 병합 때 S1 주요 버튼 복원 | gpt-6-astra PASS | e1889b6 | 성능 SwiftShader p95 53.7ms |
| R-03 | 검토(gpt-6-astra) | failed → T-402 | — | 1차 FAIL: High 근거 오연결(순간 최대 → 평시 관측)·Med 3·Low 1 — 오케스트레이터가 픽스처로 확인 → T-402 되돌림(T-401 대비 1줄·T-430 간격은 같은 회차에 허용 경로 확대) | — | — | — |
| T-402(R-03 되돌림) | gpt-6-sol + 오케스트레이터(주석 1줄) | done | 0·0 | G1 ✓(base.css·pets.css 회차 허용) · G2 test 73·build·lint, 스크린샷 오케스트레이터 재촬영·시각 확인(칩 한 줄·카드 강조) · G3 astra PASS(R-03 5건)→FAIL(Med 포커스 복귀 — 견본 페이지라 T-406으로 이월, Low 주석 직접) · G4 ✓ | gpt-6-astra | 6508120 | 스크린샷 해시 reports/T-402.md |
| T-303 | gpt-6-astra | done | 0·0·0 | G1 ✓ · G2 test 246→276·build·lint·✓ gateway, 수동 확인 실제 Ollama·knowledge · G3 sol FAIL(명세 S04 누락 정정·fake 기본값·되묻기 7개)→FAIL(fake 부분 문자열·자정 넘김·답 병합)→PASS · G4 되묻기 3개(주최·시각·폭죽) — 법정 위험 확인 질문 추가 | gpt-6-sol PASS | d87f8eb | trace 90dac3bf |
| T-102 | gpt-6-astra + 오케스트레이터(분류 2회) | done | 0·0·0 | G1 ✓ · G2 test 554→668·ruff·임시 루트 재실행 = 워커 산출물·id 불변 대조 · G3 sol FAIL(일정 덮어쓰기·회차 병합)→FAIL(회차 id·결측 병합 등)→FAIL(유형 번호·꽃게)→직접 수정 FAIL(눈꽃)→PASS · G4 수면 오탐 288→18·유형 재매핑·timeOfDay 미상(계약 v1.6) | gpt-6-sol PASS | 971f446 | events 964f24e4 · qc a40190cc (TourAPI 보강 전) |
| R-03 | 검토(gpt-6-astra) | done | — | 1차 FAIL → T-402 되돌림(High 근거 오연결 등) · 2차 PASS(Low 2 → T-406·T-405 이월). 1차 재실행 1회는 오케스트레이터 명령 실수(stdin 미차단)로 30분 대기 후 중단·재시작 | gpt-6-astra PASS | — | — |
| T-504 | gpt-6-sol | done | 0·0·0 | G1 ✓(006 마이그레이션 명세 확대) · G2 test 30→38·stan·✓ records · G3 astra FAIL(XML 이스케이프·잠금값 위조 등)→FAIL(스타일 id·숫자 표기·이력 트리거)→PASS · G4 docx ZIP 직접 대조(한국어 날짜·종류별 각주·스타일 연결), 계약 v1.6 lockedFields 규칙 | gpt-6-astra PASS | 111eabf | 예시 docx 7db5956a — 사람이 한글에서 확인 필요 |
| T-432 | gpt-6-sol + 오케스트레이터(원거리 인형 3회) | done | 0·0 | G1 ✓ · G2 test 82→93·build·lint·색 0 · G3 astra FAIL(성능 445 draw call·이름표·군중 겹침 등 Med 6)→FAIL(원거리 인형 측면 소실)→직접 수정(교차·윗면·10삼각형) PASS · G4 스크린샷(작은 이름표·카메라 확대), 성능은 같은 실행 빈 판 대비 p95 1.01배 | gpt-6-astra PASS | caf0024 | 삼각형 117,574 |
| T-404 | gpt-6-sol + 오케스트레이터(배치·태블릿·필터·날짜) | done | 0·0 | G1 ✓ · G2 npm ci 뒤 test 81→82·build·lint · G3 astra FAIL(Med 5)→FAIL(태블릿 폭)→직접 수정 3회 PASS · G4 폭 5종 겹침 실측·S1 배치 규칙 결정, develop 통합 뒤 홈 크래시(?at= 파싱) 발견·수정 | gpt-6-astra PASS | c57ee31 | e2e 25 통과 |
| T-310 | gpt-6-astra | done | 0·0 | G1 ✓ · G2 test 535→683·build·lint·✓ gateway · G3 sol FAIL(상태·MIME·크기·중단·점 세그먼트)→PASS · G4 수동 curl(원장·docx 200, 미구현 503) | gpt-6-sol PASS | b2815ce | — |
| T-103 | gpt-6-astra + 오케스트레이터(직전 기록 검증 2회) | done | 0·0·0 | G1 ✓ · G2 test 701→776·ruff·두 번 실행 해시 동일 · G3 sol FAIL(골드B 누수 등)→FAIL(σ=0 등·정정 미반영)→FAIL(parquet 해시)→직접 수정 PASS · G4 음수 25.7% 원인 분석 → 계획 06 §8 게이트 재정의(계획 리뷰 5차 PASS) | gpt-6-sol PASS | 9bdf839 | labels 0cf4a6ef · g0 27f09350 |
| T-405 | gpt-6-sol + 오케스트레이터(실제 Ollama 녹화) | done | 0·0·0 | G1 ✓ · G2 test 87→93·build·lint · G3 astra FAIL(Med 6: 필드 수정·되묻기 4회 등)→FAIL(Med 3)→PASS(Low 2 → T-406) · G4 스크린샷(한국어 게이트·날짜, 폭죽 한 질문), develop 병합 뒤 e2e 34 통과 | gpt-6-astra PASS | 24bc233 | 녹화 SSE 9ea9eee2 |
| T-505 | gpt-6-sol + 오케스트레이터(마스킹·계약·PSR-12) | done | 0 | G1 ✓ · G2 test 42·stan·✓ records·게이트웨이 curl 200 · G3 astra FAIL(토큰 로그·추가 키)→직접 수정: dev.mjs 줄 조립 마스킹·경계 정규식·종료 flush(리뷰 4회)·계약 additionalProperties false → PASS · G4 실제 records 로그에서 토큰 원문 0건 | gpt-6-astra PASS | 40b9b50 | — |
| T-104 | gpt-6-astra + 오케스트레이터(표식 비교·정본 해시) | done | 0·0 | G1 ✓ · G2 test 46→123·실제 실행(결측 18.4% — 미수집 데이터를 정확히 잡음) · G3 sol FAIL(High 5)→FAIL(High 3)→FAIL(High 1·Med 1)→직접 수정 2회 PASS · G4 계획 fetch 게이트 정정(반영 지연 35일, 리뷰 4차 PASS) | gpt-6-sol PASS | f08aebc | — |
| T-307 | gpt-6-astra | done | 0·0·0 | G1 ✓ · G2 gateway 735→743→744·build·lint·✓ gateway · G3 sol PASS(Med 1·Low 1)→PASS(Med 1·Low 1)→PASS · G4 되묻기 요청 판정 결함(오케스트레이터) → 1회차 반영 | gpt-6-sol PASS | f2b2ad5 | demo-yeongjong.jsonl 407faa1e… |
| T-203 | gpt-6-astra + 오케스트레이터(3회차부터 직접 — 발행·G0·파이프라인 연계) | done | 0·0·0 | G1 ✓ · G2 forecast 839→866→1005·백테스트 재실행 해시 동일·실데이터 파이프라인 features→publish · G3 sol FAIL×8 → PASS(9차) + develop 후속 PASS, 계획 06 §8 astra FAIL×2 → PASS · G4 공유 카드 제거가 T-104 독자를 깨뜨림(발견·수정), 포함률 단위 T-104↔T-203 불일치(계약에 비율 0~1 명시) | gpt-6-sol PASS · gpt-6-astra(계획) PASS | 9d1b6af·c98b8dc | bt-v1-af1d52f3284a71e557e6 points 77bdc4c7… |
| R-04 | gpt-6-sol(검토) + 오케스트레이터(수정) | done | — | FAIL(전회차 실버·분모 공개) → FAIL(단순 모델 무가중) → PASS · 되돌림 T-203: 9a3b5eb·dfd1035 | gpt-6-sol PASS | dfd1035 | 사용 모델 v1-01c9b47895d6cd22c393 |
| T-604 | gpt-6-astra | done | 0·0 | G1 ✓ · G2 knowledge 284→288·ruff·✓ knowledge·실기동 사용 모델 등록 · G3 sol FAIL(세션 간 같은 문장 id)→PASS · G4 기동 적재 포인터 확인, 기존 저장소 기준 TTL 새 정의 병합(오케스트레이터) | gpt-6-sol PASS | 4bc542f | — |
| G1 | 오케스트레이터 | done | — | 백테스트 v1(사용 모델 v1-cf7766 단순 49.3%·57.0%) · dev.mjs --check 서비스 5개+Ollama ✓ · SHACL 실사용: 임시 저장소 모델 등록→영종 행사·예보 적재→게이트 A 통과 위반 0 | — | — | — |
| (오케스트레이터) knowledge 기준 동기화 | 오케스트레이터 | done | — | 기존 저장소에 기준 TTL 새 정의·빠진 술어만 추가(masterVersion +1), 값 충돌·삭제는 저장값 유지+경고, 빈 노드 순환 방지 · knowledge 292 | gpt-6-sol FAIL×3 → PASS | 84a4f11·8d5e9a8·a4c5130·6caffa1 | — |
| T-204 | gpt-6-astra + 오케스트레이터(계보 인터페이스·계약·전회차 선택·OOD·실버 규모대) | done | 0·0·0 | G1 ✓ · G2 forecast 1101→1113→1115·ruff·✓ forecast, 실사용: 영종 /predict 200·관측 3·근거 5종·modelVerdict 미검증·p95 0.36~0.9초, knowledge 행사→유사 5→평시→예보 적재 200·게이트 A 위반 0 · G3 sol FAIL(평시 불완전 창 High)→PASS(Med 2 직접 수정) · 워커 BLOCKED 2회(계보 인터페이스·단위 '일') 오케스트레이터 해소 | gpt-6-sol PASS | 460669d | — |
| T-407 | gpt-6-sol + 오케스트레이터(계약 level·actualLevel, 마지막 Med 3 직접) | done | 0·0·0 | G1 ✓ · G2 web 129→131→135→137·build·lint·색 0·e2e 6 · G3 astra PASS(Med 4)→PASS(Med 3 직접 수정) · G4 스크린샷 낮·밤·모바일·S7·실사용 직접 확인(축 제목 겹침·모바일 글자·데이터셋 누락 → 반영) | gpt-6-astra PASS | 090b08c | 스크린샷 day 579a6b0a… |
| T-205 | gpt-6-astra | done | 0·0·0 | G1 ✓ · G2 forecast 1134→1158→1165·ruff·✓ forecast, 실제 실행 128초·예보 211(OOD 211 — T-204b 뒤 재실행) · G3 sol FAIL(High 공개일 제외 → 오케스트레이터 판정: 제외 안 함·기록, Med runId)→FAIL(High 교체 중단 → 판정: runId 감지로 충분·동시 실행 잠금, Med promotedAt)→PASS(Med 설정 해시 → T-204b, Med 빈 JSONL → T-207 메모) · G4 교체·runId 확인 | sol PASS | a3bc88e·53559d1 | upcoming.parquet fd1b8fbc…·jsonl 362a5ca2…·qc c2d4eb1f…(9/25 1회차 실행) |
| T-304 | gpt-6-astra + 오케스트레이터(실사용 확인·해설 범위 축소·요인 문장 라벨 고정) | done | 0·0·0 | G1 ✓ · G2 gateway 786→814→816→819→821·build·lint·✓ gateway(워커 샌드박스 listen EPERM은 오케스트레이터 환경에서 통과) · 실사용 소래포구 발행·스냅샷 1.67초, Ollama 끔 2.85초, fake+Ollama 요인 0.84초(T-304.live.md) · G3 sol FAIL(High 두 번 실패 뒤 템플릿 → 판정: 명세대로, High 요인 원문 일치 → 완화)→FAIL(High 풀어 쓴 문장 검증 불가 → 라벨 그대로만)→PASS · G4 경로·300줄·역할 주석 ✓ | sol PASS | 45d250a·a352073 | — |
| T-102b | gpt-6-astra | done | 0·0 | G1 ✓ · G2 forecast 1121→1123(pyld 실패는 L1 가상환경 미동기화 — uv sync로 해결)·ruff, 빌드 24.0→0.88초·후보 0.016초 재현 · G3 sol FAIL(High 캐시 행/스냅샷 순서)→PASS | sol PASS | 2b1a5f2·bf7056d | 입력 parquet 해시 변경 없음(워커 확인) |
| T-204b | gpt-6-astra + 오케스트레이터(요약 modelVerdict — 계약 c93d2ba·d67ccf7) | done | 0·0 | G1 ✓(설정 2줄) · G2 forecast 1198→1199→1206·ruff·✓ forecast, 소래포구 정수·등급 불변 · G3 sol FAIL(High 자체 문구 중앙값 단정 — 명세 오류, Med runId 캐시 설정)→PASS · 오케스트레이터 modelVerdict sol PASS(Low 예전 parquet 테스트 반영) | sol PASS | 259b11c·7b8adca·27d7f1d | 일괄 재실행 결과는 다음 줄 |
| (오케스트레이터) T-205 일괄 재실행 | 오케스트레이터 | done | 0 | develop 27d7f1d·리눅스 체크아웃, 88.7초, 예보 211·OOD 65·전부 4등급·503 2·변환 불가 8 | — | — | upcoming.parquet 7b6038d2dd13adcc…·jsonl d6557491bb6b192a…·qc 8ee34606d236d792… · runId batch-23a5de14… |
