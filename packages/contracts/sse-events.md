# SSE 이벤트 계약 — 게이트웨이 → 웹 (v1.1)

- 스트림: `POST /api/team/sessions/{id}/messages` 응답(`text/event-stream`), 데모 재생은 `GET /api/team/replay/{traceId}`.
- 한 이벤트 = `event: <이름>` + `data: <JSON>`. `data` 모양은 `schemas/sse-event.schema.json`이 이름별로 정한다. `seq`는 0부터 1씩 증가한다.
- **원칙**
  1. 게이트 A 전에는 숫자·문장을 보내지 않는다.
  2. 게이트 A 뒤 `forecast`는 **숫자 카드(`forecast-card`)만** — 근거·요인 문장·관측값은 담지 않는다(스키마가 거부한다).
  3. 문장(`claim`)과 근거 카드(`evidence`)는 **팀장이 발행한 뒤에만**, 상태 `published`로 보낸다.
  4. 발행된 예보서 전체는 `GET /api/forecasts/{id}`가 `forecast-report`로 돌려준다(새로고침·공유 링크).

| 이벤트 | 언제 | data | 웹이 하는 일 |
|---|---|---|---|
| `agent_status` | 팀원 상태가 바뀔 때마다 | `agent-status` | 작업판의 펫 상태·말풍선 |
| `agent_step` | 팀원 작업 하나가 끝날 때 | `agent-step`(입력 요약·출력 근거 id·시간) | 펫을 눌렀을 때 보여 줄 작업 기록 |
| `event_card` | 받아쓰기·동네지기가 행사 카드를 채웠을 때 | `event-draft` | 행사 카드(칩), 점선 칩 = 빠진 값 |
| `ask` | 필수값이 없거나 모호할 때 | `{field, question, options[]}` | 되묻기 버튼 |
| `gate` | 게이트 A·B·발행 검사가 끝날 때 | `gate-report`(revision·masterVersion) | 팀장 도장 / 위반 손들기 |
| `forecast` | 게이트 A 통과 직후 | `forecast-card` | 숫자 카드·판정 배너·구간 막대 |
| `claim` | **발행 뒤** 문장마다 | `claim`(status = published) | 설명 문장 + 근거 칩 |
| `evidence` | **발행 뒤** 한 번 | `{items: evidence[]}` | 근거 서랍의 카드 |
| `suggest` | 발행 뒤 | `{actions[]}` | 다음 할 일 버튼 |
| `done` | 요청 처리 끝 | `{sessionId, forecastId}` | 입력창 다시 열기, 예보서 링크 |
| `error` | 발행 중단·장애 | `{code, message}` | 오류 카드(펫 + 할 일) |

**새 예보 한 번의 순서** (`docs/plan/10` §3)
```
agent_status(lead) → agent_status/agent_step(dictation) → event_card → [ask → 사용자 답]
→ agent_status/agent_step(local-guide ∥ archivist) → agent_status/agent_step(forecaster)
→ gate(A) → forecast(카드)                       ← 여기까지 문장 없음
→ agent_status/agent_step(explainer) → gate(B)
→ agent_status/agent_step(card-maker ∥ briefer)   ← 검증된 문장만 고른다(새 문장을 만들지 않는다)
→ gate(publish) → claim × N → evidence → suggest → done
```
- 게이트 A 실패: `gate(A, passed=false)` → `error(ANALYSIS_GATE_FAILED)` → `done`(숫자를 보내지 않는다).
- `error.code`: `ANALYSIS_GATE_FAILED` · `SERVICE_UNAVAILABLE` · `DEADLINE_EXCEEDED` · `OUT_OF_SCOPE`.
- LLM이 꺼져 있어도 순서는 같다. 문장은 템플릿으로 만들어져 같은 게이트를 지난다.
