<!-- T-303의 실제 Ollama·knowledge 연결 확인 조건과 이벤트 기록을 남긴다 -->
# T-303 수동 확인 기록

2026-09-25 01:51~01:52 KST, 게이트 피드백 2회차 반영 후 재확인. gateway는 L3 작업 트리, knowledge는 본 레포(develop)의 실제 Python 코드로 실행했다. 기존 서비스와 충돌하지 않도록 gateway `18787`, knowledge `18020` 포트를 사용했다. knowledge는 임시 메모리 저장소이며 계약의 `model-card/valid-v0-1-0.json`을 `store.master.register_model_run`으로 등록했다. 현재 develop에는 모델 등록 HTTP 라우트가 없으므로 이 준비는 HTTP 경로 대신 실제 저장소 메서드로 수행했다. 운영용 근거 저장소는 수정하지 않았다.

- `FORECAST_MODE=fake`, `LLM_MODE=ollama`
- 실제 Ollama 모델: `qwen3:4b-instruct-2507-q4_K_M`
- 세션: `s-1790268665143-61d749c2-5388-4e5e-a15b-fdb5a7e3dbfe`
- JSONL: 본 레포 `traces/s-1790268665143-61d749c2-5388-4e5e-a15b-fdb5a7e3dbfe.jsonl`
- SHA-256: `90dac3bf48ef93cbf0aad420c30e195ed04b03cd7b0397ca43941069e4099bd6`

## 첫 요청

```bash
curl -N -H 'Content-Type: application/json' \
  --data-binary '{"text":"10월 18일 영종 씨사이드파크에서 불꽃축제를 해요"}' \
  "http://127.0.0.1:18787/api/team/sessions/$sessionId/messages"
```

11개 이벤트, `seq=0..10`:

```text
agent_status(lead, working)
agent_status(lead, done)
agent_step(lead)
agent_status(dictation, working)
agent_status(dictation, blocked)
agent_step(dictation, ms=3525, usedLlm=true, model=qwen3:4b-instruct-2507-q4_K_M)
event_card
ask(hostType, options=지자체·민간·대학·기타)
ask(time)
ask(hazards, options=폭죽 써요·해당 없어요)
done(forecastId=null)
```

유형은 원문의 단일 계약 유형어인 불꽃으로 보완했다. 요금은 `미상`, 예산은 `null`로 두고 질문하지 않았다. 주최 유형·시각·폭죽 사용을 세 질문으로 확인했다. 원문의 불꽃은 폭죽 사용 확인 후보로만 쓰며 hazards에 자동으로 넣지 않았다. 시각 질문의 `field`는 `time`이고 답변은 `{startsAt, endsAt}`이다.

## 같은 세션의 답변

다음 값은 실제 행사 사실을 주장하는 자료가 아니라 재개 경로 확인을 위해 명시적으로 입력한 시험값이다.

```bash
curl -N -H 'Content-Type: application/json' \
  --data-binary '{"text":"수동 확인용 시각·주최·위험요소 보완","answer":{"startsAt":"2026-10-18T19:00:00+09:00","endsAt":"2026-10-18T21:00:00+09:00","hostType":"지자체","hazards":["폭죽"]}}' \
  "http://127.0.0.1:18787/api/team/sessions/$sessionId/messages"
```

20개 이벤트, 새 요청의 `seq=0..19`:

```text
agent_status(lead, working)
agent_status(lead, done)
agent_step(lead)
agent_status(dictation, working)
agent_status(dictation, done)
agent_step(dictation, usedLlm=false, model=null)
event_card
agent_status(local-guide, working)
event_card
agent_status(archivist, working)
agent_status(local-guide, done)
agent_step(local-guide)
agent_status(archivist, done)
agent_step(archivist)
agent_status(forecaster, working)
agent_status(forecaster, done)
agent_step(forecaster)
gate(A, passed=true, revision=4, masterVersion=2)
forecast
done(forecastId=null)
```

knowledge 요청 로그의 shapes는 `S03,S04,S05,S06,S07,S08,S09`로 실제 `ANALYSIS_SHAPES` 7개와 같았다. 답변의 시간대는 19시 시작 규칙으로 `야간`이 됐고, hazards는 사용자가 확인한 `["폭죽"]`이었다. `/steps` 작업 7개도 모두 `agent-step` 스키마를 통과했다. JSONL 31줄의 요청 식별자를 제외한 봉투는 두 수신 스트림과 완전히 같았다.

두 스트림 모두 실제 수신 본문을 계약 Ajv 스키마와 `sequenceProblems(events, {mode:"new"})`로 다시 검사했다. 스키마 전부 통과, 순서 위반 `[]`. 발행·records 저장·claim/evidence 이벤트는 없었다.

## 구현 범위

`answer`는 `event-draft`의 필드명을 키로 쓰는 부분 객체다. `missing`·`ambiguities`는 서버가 계산하며 답변으로 받지 않는다. 요금·예산의 기본 미상 값은 `fee:"미상"`·`budgetKrw:null`이다. `answer`는 직전 스트림에 실제로 보낸 `ask.field`만 병합한다. `time`은 `startsAt`·`endsAt`만 허용하며, 묻지 않은 키는 무시하고 받아쓰기 작업 기록 `note`에 “무시한 답 필드”로 남긴다. 확정값 수정은 T-305에서 다룬다. 좌표는 답변에서 받지 않고 지오코딩으로 확인한다. 행사 적재 성공 후에는 조건을 고정한다. 행사 적재 실패 뒤에는 같은 세션 재시도가 가능하지만 묻지 않은 확정값 수정은 반영하지 않는다. 부분 적재 실패 뒤에는 `answer` 없이 같은 세션에 재시도하며 기존 초안을 재사용한다. 같은 행사·근거를 다시 적재해도 계약 `changesContent`에 따라 revision은 증가하지 않는다. 분석 완료 뒤 후속 요청은 T-305 범위라 새 세션이 필요하다.

가짜 서비스 JSON은 `packages/contracts/fixtures/`의 행사·예보·평시·유사 행사 픽스처를 복사했다. 장소 후보 JSON은 행사 픽스처의 좌표·지역을 사용했다. 기본값은 `FORECAST_MODE=live`이며 forecast 미구현·연결 실패 시 숫자 없이 계약 오류 `SERVICE_UNAVAILABLE`로 끝난다. `fake`를 명시하면 시작 경고 한 줄을 남기고 장소명 `영종 씨사이드파크`·시군구 `28110`·유형 `불꽃`이 모두 일치하는 행사만 예시 수치를 재생한다. 예보 식별자와 행사 참조·D-14 메타데이터만 요청에 연결한다. 장소명 비교는 NFKC·공백 및 정확한 `인천 중구`/`인천광역시 중구` 접두어만 정규화한다. 다른 장소의 지오코딩과 다른 유형·지역·장소의 예보·유사 조회는 503으로 거부한다. 부산 씨사이드파크를 영종으로 바꾸지 않는다. 계약의 기존 `SERVICE_UNAVAILABLE`을 사용하므로 오류 코드 추가는 없다.

위험 관련 키워드는 `hazard-question.ts`의 상수 표로 관리한다. 불꽃·폭죽/달집·낙화·들불·횃불/수상·물놀이·카누·래프팅/등산·산행을 각각 폭죽/불/수면/산 확인 후보로 쓴다. 여러 후보도 질문 하나에 모으며, 사용자 답 `hazards:[]`를 확정한 뒤에는 재질문하지 않는다. 시간대는 한국 현지 날짜까지 비교해 10시~익일 01시는 종일, 19시~익일 02시는 야간으로 분류한다.

세션은 메모리에 보관하므로 프로세스 재시작 후 `/steps` 복구는 이번 범위에 포함하지 않았다. JSONL에는 요청별 `requestId`와 SSE 봉투를 순서대로 남겼다.

## 자동 검증

- `npm -w services/gateway test`: 23개 파일, 276개 테스트 통과. S04 제목·발행기관 누락, S09, 기본 live 장애, 부산 씨사이드파크·영종 공연의 fake 수치 차단, 질문 세 개, 익일·연도 경계의 시간대, 직전 질문 외 답변 무시, 위험 확인·드론쇼·빈 배열 재질문 방지, 부분 적재 재시도, trace 정지·쓰기 오류, SSE 소비 정지, undefined 본문 거부 포함.
- `npm -w services/gateway run build`: 통과.
- `npm -w services/gateway run lint`: 81개 파일 통과.
- `node scripts/dev.mjs --check --only gateway`: 종료 코드 0, `✓ gateway`, `✓ ollama`. 기본 8787 포트에 기존 리스너가 있어 `GATEWAY_PORT=18788 node scripts/dev.mjs --check --only gateway`도 실행해 이번 작업 트리의 새 프로세스로 동일 결과를 확인했다.

trace는 SSE 전송 뒤 같은 순서로 기록한다. 파일 쓰기는 마감·연결 종료 신호로 취소하며 장애는 고정 로그만 남긴다. 오류·완료 전송과 마지막 기록은 각각 250ms의 종료 예산으로 제한하고, 기록 실패가 `done`이나 세션 잠금 해제를 막지 않는다.
