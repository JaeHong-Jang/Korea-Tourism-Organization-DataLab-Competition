# 이월 목록 — 아직 명세를 쓰지 않은 task에 넣을 것 (task 파일을 쓸 때 해당 절을 옮기고 여기서 지운다)

## T-303 (게이트웨이 예보팀 런타임·SSE)
- [R-02 Med] `services/gateway/src/clients/request-json.ts:53` — 발신 본문이 TS 타입만 거쳐 전송된다 → 본문이 있는 호출은 요청 스키마(Ajv)로 검증한 뒤 보낸다.
- [T-502 리뷰] records 스냅샷 저장은 **knowledge `/publish` 성공 뒤에만**(records는 모델 실행 등록 여부를 보지 않는다 — S08이 발행 때 본다).
- SSE 스트림 테스트는 `@crowdcast/contracts/rules/sse-sequence.mjs`의 `sequenceProblems(events, ctx)`로 판정(새 예보·후속 요청 두 모드).

## T-503 (records 초안·docx)
- [R-02 Low] `services/records/src/Health/Controller.php:16` — health 응답을 반환 직전 계약(OpenAPI health 스키마)으로 검증.

## T-204 (예측 API)
- [T-202 게이트 4 Low 해소됨] 확률 표시 문구는 `rules/judge.py`의 경계 보존 규칙을 그대로 쓴다(API에서 다시 반올림하지 않는다).

## T-402 (UI 키트) — 이미 T-402.md에 적음(T-401 이월 5건)
