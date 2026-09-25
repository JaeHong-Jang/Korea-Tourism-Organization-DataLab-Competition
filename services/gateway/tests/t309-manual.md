# T-309 검증과 통합 조건

날짜·시간대·요금·유형 변경은 `/v1/whatif`와 기존 분석·보고·검증 경로를 재사용한다. 바뀐 행사 조건으로 유사 사례도 다시 조회하며, 새 근거 그래프에서 A → 카드 → B → 발행을 거친다. 기존 행사 원문과 예보 스냅샷은 보존하고 새 스냅샷만 같은 행사에 추가한다. 실패한 변경은 현재 발행본을 교체하지 않는다.

상담의 `sessionId`는 유지된다. 변경 예보서와 그 문장의 `sessionId`는 격리된 `s-whatif-*` 근거 그래프이며, 이후 이유·저장·초안 요청도 그 그래프를 사용한다. `done.forecastId`는 변경 발행 성공 시 새 ID, 변경 질문·실패 시 null, 날씨·유사 답변 시 기존 ID다. 기존 계약에 `previousForecastId`가 없어 추가하지 않았다. 이전 ID 목록은 세션 내부에 보존한다.

모호한 값은 `new` 모드의 `ask`로 묻는다. 날짜는 `startsAt`, 시간대는 `timeOfDay`, 요금은 `fee`, 유형은 `type`이며, 복합 조건은 `whatif`다. 버튼의 `value`를 메시지 `text`로 보내면 재개한다. 실제 질문한 필드의 `answer`도 받으며, 다른 필드는 반영하지 않는다. 요일만 지정하면 기존 행사일 이후 해당 요일, 명시한 다음 주는 요청일 기준 다음 주로 해석한다. 날짜만 바꾸면 기존 시작 시각과 행사 길이를 보존한다.

## 확인한 경로

- `whatif-stream.test.ts`: 날짜 3·시간대 2·요금 2·유형 1·날씨 1·유사 1, 정본 SSE 순서와 근거 전송·독립 숫자 검산. 날씨 성공 사례는 T-208의 기본 보정 없음 가정을 모사한 상류 픽스처를 사용한다.
- `whatif-questions.test.ts`: 모호한 값과 버튼 답, 무관한 필드 무시, 한 번의 LLM 분류, 예보 없는 세션, 질문 취소·복합 조건·잘못된 날짜.
- `whatif-failures.test.ts`: A/B 거부, 잘못된 상류 ID·기준일, 연속 변경, 분류와 재작성을 합한 LLM 최대 3회, 가정 누락 보류, OOD 눈·비 반복 질문.
- 평가 JSONL에는 W01 유료·W02 일요일·W03 밤 요청을 추가했다. 이를 실행하기 위한 평가기의 개수·순서 모드·상류 픽스처·예보서 조회도 함께 확장했다. 기존 20개 시나리오는 그대로 유지했다.

## BLOCKED: 기존 예보의 날씨 가정 참조

`packages/contracts/rules/integrity.mjs`의 `resolves()`는 세션에 가정 정의가 하나라도 있으면 다른 기준 그래프 가정을 참조하지 못하게 한다. 기존 예보는 피크일·동시체류율 가정이 있지만 `as-weather-adjustment`는 없다. 이 상태에서 날씨 근거를 추가하면 `evidence.assumptionId → as-weather-adjustment 참조 없음`으로 거부된다. 예보 객체도 같은 ID의 내용 변경이 금지되어 있다.

현재는 `forecast.assumptions`에 `as-weather-adjustment`가 있는 예보만 우천 점검과 기본 보정 원칙을 B → 발행으로 설명한다. 가정이 없으면 새 숫자나 가정을 만들어 넣지 않고 `OUT_OF_SCOPE`로 근거 부족을 안내한다. 따라서 T-309의 모든 기존 세션에서 날씨 답변 발행 요구는 아직 완료가 아니다.

해결은 오케스트레이터가 결정해야 한다. T-208이 보정 미적용일 때도 해당 가정을 예보에 포함하거나, 계약과 knowledge의 참조 검사를 함께 확장해 세션에 없는 가정을 기준 그래프에서 찾도록 해야 한다. 어느 쪽도 이 task의 허용 경로에서 변경하지 않았다. 선택한 방식으로 통합한 뒤 가정 없는 원래 픽스처에 대한 날씨 성공 검사를 추가해야 한다.

## 검증 실행

- `npm -w services/gateway test`: 1,013 통과·1 건너뜀·3 실패. 실패는 기존 `proxy-http.test.ts`의 `listen EPERM: operation not permitted 127.0.0.1`이며 샌드박스가 서버 바인딩을 허용하지 않는다.
- `npm -w services/gateway test -- --exclude tests/proxy-http.test.ts`: 64 파일·1,013 검사 통과, 기존 데모 검사 1건 건너뜀.
- `npm -w services/gateway run build`, `npm -w services/gateway run lint`: 통과.
- `npm -w services/gateway run eval:scenario -- --fake --out reports/evals/T-309-scenario-fake`: 23/23 통과. 공유 `reports/evals/`에 JSON·Markdown을 남겼다.
- 실제 Ollama와 전체 SHACL 서비스 통합 실행은 하지 않았다. 오케스트레이터가 로컬 서버 바인딩이 가능한 환경에서 전체 test와 실제 스트림을 재확인해야 한다.

## 산출물 SHA256

- `reports/evals/T-309-scenario-fake.json`: `cdabf4c084b82718e7ecb8bf6af2d32f1405df2a80d4ef34ec8bb15851e5a66e`
- `reports/evals/T-309-scenario-fake.md`: `8e3d69333dcce3330878281d01f7c18dc5662961da5b14f7e9d1b90b1682c5ec`
