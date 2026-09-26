# T-307 수동 확인 — 2026-09-25

`GET /api/team/replay/demo-yeongjong`의 검증·SSE 봉투·시간을 로컬 HTTP로 확인했다. 새 예보의 `event`·`id` 프레임과 `{event, seq, data}` 봉투를 그대로 사용하며 `at`은 JSONL에만 있다.

## 발표 백업 생성

```bash
T307_RECORD_DEMO=1 npm -w services/gateway test -- tests/replay-demo.test.ts -t '발표 백업 trace를 녹화한다'
```

`FORECAST_MODE=fake`, `LLM_MODE=fake`로 기존 T-303 계약 시나리오의 입력 `10월 18일 영종 씨사이드파크에서 불꽃축제를 해요`를 그대로 보냈다. 실제 Hono 세션·메시지 라우트·팀 런타임·trace writer를 실행했다. forecast는 기존 계약 픽스처, knowledge는 기존 `teamFixture`의 메모리 구현을 사용하며 계약 참조 무결성 검사도 거쳤다. 실제 SHACL 서버를 실행한 녹화는 아니다. 외부 서비스와 Ollama 생성 호출은 없었다.

첫 요청은 위험요소·시각·주최 유형을 되묻는다. 같은 입력 문장과 구조화 답변 `{startsAt:"2026-10-18T19:00:00+09:00", endsAt:"2026-10-18T21:00:00+09:00", hostType:"지자체", hazards:["폭죽"]}`으로 분석을 한 번 완료했다. 실제 분석 요청 한 건의 줄만 골라 `fixtures/replay/demo-yeongjong.jsonl`에 복사했다. 요청 id·시각·순번·봉투는 수정하지 않았다. 발표 파일은 20줄, `seq=0..19`, 게이트 A 통과 → 숫자 카드 → `done(forecastId=null)`이다. 현재 T-303 범위대로 B·발행·문장·근거 카드는 없다.

입력은 위의 행사 문장과 고정 답변뿐이다. 원본·발표 파일의 행사명·장소명·작업 요약·note를 확인했고 사람 이름·연락처·이메일·사용자 원문은 없다. `FORECAST_MODE=fake`의 “계약 예시” 안내는 그대로 보존했다.

| 산출물 | 위치 | SHA-256 |
| --- | --- | --- |
| 원본 세션, 두 요청 | 본 레포 `traces/s-1790283909741-1c05737b-3394-46c8-9c62-42ac04912a91.jsonl` | `23ccea7d0de0a62ad13f56da634903c723dd62a602bd14295907693453bf19ec` |
| 발표 백업, 분석 요청만 | `services/gateway/fixtures/replay/demo-yeongjong.jsonl` | `407faa1ee7d01ca9f3e4c488d92e4f014e57abff4b7b402c82eabeda38f6ab54` |

본 레포는 `/mnt/c/Users/User/Desktop/대학교/3학년/한국관광공사 데이터랩 활용 경진대회`이며 워크트리 `traces/` 공유 링크로 원본을 저장했다. 재생과 수동 측정 후에도 두 해시는 같았다. 기본 테스트에서는 녹화 테스트 한 개만 생략해 발표 파일을 다시 쓰지 않는다.

## 기동 및 curl 시간 비교

기본 `node scripts/dev.mjs --check --only gateway`는 종료 코드 0과 `✓ gateway http://127.0.0.1:8787/api/health`를 출력했다. 그러나 8787에는 다른 서버가 이미 실행 중이었고, 요청된 `curl -N http://127.0.0.1:8787/api/team/replay/demo-yeongjong`의 응답은 404였다. 이 결과를 새 코드의 기동 증거로 사용하지 않았다. 기존 프로세스를 유지하고 비어 있는 18787에서 작업 트리를 별도로 검증했다.

```bash
GATEWAY_PORT=18787 node scripts/dev.mjs --check --only gateway
# 종료 코드 0, ✓ gateway http://127.0.0.1:18787/api/health

GATEWAY_PORT=18787 LLM_MODE=fake FORECAST_MODE=live node --import tsx services/gateway/src/index.ts
# 별도 터미널에서 실행한다
node --import tsx services/gateway/tests/measure-replay.ts http://127.0.0.1:18787/api/team/replay/demo-yeongjong
```

`measure-replay.ts`는 `curl -f -sS -N --max-time 15 <URL>`을 실행하고 수신한 완전한 SSE 프레임마다 단조 시계로 시각을 기록한다. 수신 봉투 전체를 발표 파일과 비교한다. 첫 이벤트는 즉시 보내며 최초 파일 읽기·검증 시간은 첫 이벤트~done 시간에서 제외된다.

| 측정 | 결과 |
| --- | ---: |
| 원본 첫 시각 | `2026-09-24T21:05:09.772Z` |
| 원본 done 시각 | `2026-09-24T21:05:09.808Z` |
| 상한 적용 전 간격 합계 | 36ms |
| 상한 적용 후 간격 합계 | 36ms |
| 상한을 적용한 간격 수 | 0 |
| curl 첫 이벤트~done | 44.645ms |
| curl 프로세스 시작~종료 | 68.337ms |
| 봉투 비교 | 20개 모두 완전 일치 |

차이 8.645ms는 타이머·전송·클라이언트 수신 스케줄링을 포함한다. 실제 수신 시간의 정확한 일치를 보장하지는 않으며 재생 대기 인자는 기록 시각 차이를 따른다. `REPLAY_MAX_GAP_MS=8000`은 발표 중 LLM 대기 공백을 줄이는 유일한 간격 상한이다. 음수는 0ms, 양쪽 시각 중 하나라도 없으면 `REPLAY_DEFAULT_GAP_MS=300`을 사용한다. 20초 → 8000ms, 0·120·480ms → 120·360ms, 누락 시각 → 300ms를 실제 sleep 없는 테스트로 확인했다.

## 게이트 피드백 반영 후 되묻기 재생

R9의 새 예보 전용 이벤트인 `event_card`·`ask`를 문맥 판정에 추가했다. 게이트 A·`forecast` 중 하나라도 있으면 역시 `new`이다. 2회차 보완까지 반영한 최종 판정은 `done.forecastId === null`도 `new`로 검사하며, 네 종류 모두 없고 기존 예보 id가 있을 때만 `followup`으로 검사한다. B → 발행만 있는 후속 요청의 회귀 테스트도 통과했다.

위에서 생성한 원본 두 요청 세션을 그대로 재사용했다. 첫 요청은 `event_card` 뒤 `ask(hostType)`·`ask(time)`·`ask(hazards)`·`done(forecastId=null)`으로 끝나고 두 번째 요청에 분석이 있다. 수정 후에는 파일 전체를 사전 검증하고 첫 요청의 11개 봉투만 정상 재생한다. 파일을 다시 녹화하거나 수정하지 않았다.

8787 포트는 기존 서버가 계속 사용하므로 18787에서 작업 트리를 띄웠다. `node scripts/dev.mjs --check --only gateway`와 `GATEWAY_PORT=18787 node scripts/dev.mjs --check --only gateway` 모두 종료 코드 0과 `✓ gateway`를 확인했다. 8787 health 확인은 기존 서버의 응답이며 수정 코드의 HTTP 재생은 아래 18787 결과로 확인했다.

```bash
GATEWAY_PORT=18787 LLM_MODE=fake FORECAST_MODE=live node --import tsx services/gateway/src/index.ts
# 별도 터미널에서 실행한다. 세 번째 인자는 비교할 실제 세션 trace 경로다.
node --import tsx services/gateway/tests/measure-replay.ts \
  http://127.0.0.1:18787/api/team/replay/s-1790283909741-1c05737b-3394-46c8-9c62-42ac04912a91 \
  traces/s-1790283909741-1c05737b-3394-46c8-9c62-42ac04912a91.jsonl
```

동일한 측정기가 `curl -f -sS -N --max-time 15`로 받은 프레임을 원본 첫 요청과 비교했다.

| 되묻기 요청 측정 | 결과 |
| --- | ---: |
| 원본 첫 시각 | `2026-09-24T21:05:09.752Z` |
| 원본 done 시각 | `2026-09-24T21:05:09.769Z` |
| 상한 적용 전 간격 합계 | 17ms |
| 상한 적용 후 간격 합계 | 17ms |
| 상한을 적용한 간격 수 | 0 |
| curl 첫 이벤트~done | 20.452ms |
| curl 프로세스 시작~종료 | 45.926ms |
| 봉투 비교 | 11개 모두 완전 일치 |

첫 이벤트~done의 차이는 3.452ms다. 측정 서버는 확인 후 종료했다. 원본과 발표 백업의 SHA-256은 위 표와 동일하다.

## 게이트 피드백 2회차: 범위 밖 요청 재생

실제 세션에서 가짜 LLM·예측으로 분석을 끝낸 뒤 날짜 변경을 요청해 `runRequest`의 `OUT_OF_SCOPE` 경로를 실행했다. 준비 요청은 기록하지 않고 해당 요청만 실제 trace writer로 저장했다. 원본 스트림은 `error(OUT_OF_SCOPE, seq=0)` → `done(forecastId=null, seq=1)`이며, 수정 전 왕복 테스트는 `expected 422 to be 200`으로 실패했다.

`done.forecastId === null`이면 새 예보 문맥으로 검사하도록 수정한 뒤 같은 테스트가 200으로 통과했고 `event`·`seq`·`data`가 모두 일치했다. 대기는 주입한 가짜 함수만 사용했으며 재생 중 서비스 호출은 늘지 않았다. 기존 예보 id가 있는 B → 발행 요청은 계속 후속 문맥으로 재생된다. 예보 id 없이 B로 시작하는 잘못된 요청은 SSE 시작 전 422로 거부된다. `done`만 있고 예보 id가 없다는 이유로 거부하던 테스트는 정본 새 예보 순서 규칙과 맞지 않아 이 B 게이트 위반 사례로 교체했다.

라우트의 `onError`와 GET 콜백 바로 위에 한국어 역할 주석을 추가했다. 이번 회차는 요청된 test·build·lint를 다시 실행했으며, 위 curl 측정은 1회차 결과를 유지했다. 원본 세션과 발표 파일의 SHA-256을 다시 확인했고 모두 위 표와 동일하다.

## 자동 수용 기준 및 제한

- `npm -w services/gateway test`: 38개 파일, 744개 통과, 명시적 발표 파일 재생성 테스트 1개 생략.
- `npm -w services/gateway run build`: 종료 코드 0.
- `npm -w services/gateway run lint`: 122개 파일, 종료 코드 0, 진단 없음.
- `git diff --check`: 통과.
- 실제 세션의 분석·되묻기·범위 밖 요청을 기록한 파일로 왕복 비교. 분석 요청의 모든 봉투·헤더 일치, 재생 전후 파일 바이트·수정 시각·폴더 목록 불변.
- JSON·스키마·시각·seq·done·계약 순서 위반은 SSE 미개시 422. 잘못된 경로·폴더 밖 파일 링크는 400, 누락은 404.
- 파일은 `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`으로 열고 같은 핸들의 `fstat`으로 일반 파일 여부와 `REPLAY_MAX_TRACE_BYTES=2*1024*1024` 상한을 검사한다. 읽기 버퍼도 상한+1바이트로 제한해 검사 뒤 크기가 늘어도 422로 거부한다. 성공·실패 모두 핸들을 닫는다.
- 같은 폴더 안 파일 링크와 경로 검사 직후 외부 링크로 교체된 파일, 비일반 파일, 2MB 초과 파일은 SSE 미개시 422. 공유 폴더 링크 안 일반 파일과 정확히 2MB인 유효 파일은 통과했다.
- 여러 요청의 첫 requestId만 선택하고 seq로 정렬한다. 같은 요청의 done 뒤 이벤트도 잘라 숨기지 않고 거부한다. 다른 요청의 줄도 JSON·스키마 검사는 수행한다.
- 응답 reader 취소와 HTTP 요청 AbortSignal 모두 남은 이벤트를 중단하고 타이머 0개를 확인했다.
