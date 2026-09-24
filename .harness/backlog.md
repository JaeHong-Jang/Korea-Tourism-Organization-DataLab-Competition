# 이월 목록 — 아직 명세를 쓰지 않은 task에 넣을 것 (task 파일을 쓸 때 해당 절을 옮기고 여기서 지운다)

## T-303 — .harness/tasks/T-303.md로 옮김(2026-09-25)

## T-304 (해설가·OLLAMA_MODEL_WRITE 평가)
- [T-302 리뷰 Med] `services/gateway/evals/run-extract-eval.ts:196` — 저장 결과를 다시 채점하면 보고서가 새 측정(차이 3칸)과 과거 승인 근거(1칸 차이)를 함께 쓴다 → 과거 승인 근거는 날짜와 함께 분리하고, 새 측정이 승인 근거와 다르면 "재검토 필요"로 표시.

## T-504 (records 초안·docx)
- [R-02 Low] `services/records/src/Health/Controller.php:16` — health 응답을 반환 직전 계약(OpenAPI health 스키마)으로 검증.

## T-204 (예측 API)
- [T-202 게이트 4 Low 해소됨] 확률 표시 문구는 `rules/judge.py`의 경계 보존 규칙을 그대로 쓴다(API에서 다시 반올림하지 않는다).

## T-402 (UI 키트) — 이미 T-402.md에 적음(T-401 이월 5건)

## 계약 결정 대기 (T-603 CONTRACT-CHANGE 제안) — T-406 전에 정한다
- 세션 없이 조회하는 `GET /v1/claims/{id}/evidence`·`/v1/evidence/{id}`: 여러 세션에 같은 id가 있으면 모호하다(지금은 404). 후보: (a) 선택 쿼리 `?sessionId=` 추가 + 없으면 "유일하거나 내용이 같을 때만" 응답, (b) 문장 id 전역 유일 규칙(`c-<forecastId>-<n>`). 웹은 늘 세션 문맥이 있으므로 (a)를 기본으로 검토.

## T-604 (근거 통계·계보·모델 카드 등록)
- [T-603 리뷰 Med] `ontology/queries/datalab_usage.rq:6` — `COUNT(DISTINCT ?evidence)`는 같은 근거를 두 문장이 인용해도 1로 센다 → 메뉴별 '근거 사용 횟수'는 (문장, 근거) 쌍으로 센다. 통계 응답(`datalab-usage`)의 정의를 쿼리 주석과 스키마 설명에 맞춘다.
- (T-402 CONTRACT-CHANGE 제안) `evidence`에 사람이 읽을 조항명·법정/자체 구분·검증 시각이 없어 카드가 예보 맥락을 따로 받는다 → 후보: knowledge `/v1/evidence/{id}`·`/claims/{id}/evidence` 응답에 기준 그래프의 규칙·조항 제목을 붙인 **표시용 확장**(계약 `evidence-view`) 또는 evidence 스키마에 `ruleTitle`·`ruleKind`·`clauseTitle`(null 허용) 추가. T-406 전에 정한다.
- (T-402 게이트 4 Low) `LevelBadge` "대규모 99%" — 무엇의 확률인지(순간 최대 1,000명 이상일 확률) 배지나 툴팁에 밝힌다.

## T-433 (S1 통합) · T-435 (밤·후처리) · T-436 (성능)
- [T-431 게이트 4] 전국 판이 화면에서 작고 판 아래쪽이 KPI 패널에 가린다 → S1 통합 때 카메라 프레이밍·패널 배치를 함께 잡는다(04 §4 — 떠 있는 패널이 장면 핵심을 가리지 않게).
- [T-431 게이트 4] 밤 장면이 낮과 거의 같은 밝기 → 밤 조명(창문·가로등·무대 발광)은 T-435, 그 전에도 밤 노출을 조금 낮춘다.
- [T-431 성능] WSL에서는 GPU를 쓸 수 없어 SwiftShader(소프트웨어) 수치다(p95 40.9ms 단독·46.0ms Ollama 동시) → 실제 GPU 수치는 Windows 브라우저에서 같은 스크립트로 잰다(사람 확인 필요).

## 오케스트레이터 벌크 수집 일정(15101972, 하루 안전선 900건)
- 9/25 완료: 2024·2025 전체, 2023 대부분, 2026-07-01~08-25(8/26 이후는 공개 전) — 약 84만 행
- 9/26: 2023 나머지 → 2026-01~06 → 2022(약 900건)
- 9/27: 2021 → 2019 → 2018(2020은 코로나 — 06 §2에 따라 학습 제외 가능, 남으면)
- 명령: `cd ~/crowdcast-wt/L1 && uv run --package crowdcast-forecast python -m crowdcast.data.visitors --from <시작> --to <끝> --max-calls <n>` (재시작 가능, 캐시)
