# SSE 이벤트 계약 — 게이트웨이 → 웹

- 스트림: `POST /api/team/sessions/{id}/messages` 응답(`text/event-stream`), 데모 재생은 `GET /api/team/replay/{traceId}`.
- 한 이벤트 = `event: <이름>` + `data: <JSON>`. `data`의 모양은 `schemas/sse-event.schema.json`이 이름별로 정한다. 모든 이벤트에 `seq`(0부터 1씩 증가)가 있어 순서를 확인한다.
- **원칙**: 문장(`claim`)과 근거 카드(`evidence`)는 **팀장이 발행한 뒤에만** 보낸다(`docs/plan/10` §3). 숫자 카드(`forecast`)는 게이트 A를 통과하면 먼저 보낸다.

| 이벤트 | 언제 | data | 웹이 하는 일 |
|---|---|---|---|
| `agent_status` | 팀원 상태가 바뀔 때마다 | `agent-status` | 예보팀 작업판의 펫 상태·말풍선 |
| `event_card` | 받아쓰기·동네지기가 행사 카드를 채웠을 때 | `event-draft` | 행사 카드(칩), 점선 칩 = 빠진 값 |
| `ask` | 필수값이 없거나 모호할 때 | `{field, question, options[]}` | 되묻기 버튼 |
| `forecast` | 게이트 A 통과 직후 | `forecast` | 숫자 카드·판정 배너·구간 막대 |
| `gate` | 게이트 A·B·발행 검사가 끝날 때 | `gate-report` | 팀장 도장 / 위반 손들기 |
| `claim` | **발행 뒤** 문장마다 | `claim`(status = published) | 설명 문장 + 근거 칩 |
| `evidence` | **발행 뒤** 한 번(문장이 가리키는 근거 전부) | `{items: evidence[]}` | 근거 서랍의 카드 |
| `suggest` | 발행 뒤 | `{actions[]}` | 다음 할 일 버튼 |
| `done` | 요청 처리 끝 | `{sessionId}` | 입력창 다시 열기 |
| `error` | 발행 중단·장애 | `{code, message}` | 오류 카드(펫 + 할 일) |

**새 예보 한 번의 순서(예)**
`agent_status`(lead working) → `agent_status`(dictation …) → `event_card` → (`ask` → 사용자 답) → `agent_status`(local-guide·archivist·forecaster …) → `gate`(A) → `forecast` → `agent_status`(explainer …) → `gate`(B) → `gate`(publish) → `claim` × N → `evidence` → `suggest` → `done`

- `error` 코드: `ANALYSIS_GATE_FAILED`(게이트 A 실패, 숫자를 보여 주지 않음), `SERVICE_UNAVAILABLE`(예측·근거·기록 서비스 연결 실패), `DEADLINE_EXCEEDED`(요청 마감 초과), `OUT_OF_SCOPE`.
- LLM이 꺼져 있어도 순서는 같다. 문장은 템플릿으로 만들어져 같은 게이트를 지난다.
