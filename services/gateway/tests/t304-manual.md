<!-- T-304 2회차 피드백의 자동 검사와 실제 상담 재현 방법을 기록한다 -->
# T-304 실사용 재현

2회차 수정 뒤 실사용 확인은 오케스트레이터가 develop의 forecast·knowledge·records로 실행한다. 이 문서는 재현 방법이며 실사용 통과 기록이 아니다.

## 자동 검사

L3 작업 트리 루트에서 실행한다.

```bash
npm -w services/gateway test
npm -w services/gateway run build
npm -w services/gateway run lint
node scripts/dev.mjs --check --only gateway
```

`tests/live-explanation.test.ts`는 `fixtures/services/forecast-live-sorae.json`에 복사한 실제 소래포구 응답으로 입력 4,000자 이하, 제목 기반 OOD 근거, 수치 서식을 확인한다. 원본은 본 레포의 `data/cache/t304/forecast-live-sorae.json`이다. 예측 값은 수정하지 않았다.

`tests/team-explainer.test.ts`는 LLM 성공과 `context`·`timeout`·`schema`·`http`·`parse` 대체 이유를 확인한다. `tests/team-gate-b.test.ts`는 고정 문장까지 포함한 초안 훼손을 주입해 재작성과 발행 중단을 확인한다. `tests/team-publish.test.ts`는 발행 전 문장·근거 없음과 행사/스냅샷 각각 1.5초 저장, 실패·시간 초과 안내를 확인한다.

## 실제 상담

오케스트레이터가 develop의 forecast·knowledge·records와 Ollama를 먼저 준비한다. 주소는 `.env`의 `FORECAST_URL`·`KNOWLEDGE_URL`·`RECORDS_URL`·`OLLAMA_HOST`를 사용한다. 환경 변수로 덮어쓸 수 있다. L3에서는 다른 레인의 서버를 기동하지 않는다.

```bash
node_modules/.bin/tsx services/gateway/tests/t304-manual-run.ts
```

스크립트는 로컬 forecast의 영종 지오코딩을 한 번 호출해 지명 사전을 예열한다(30초 제한). 이후 실제 SSE 라우트로 영종 불꽃축제(2026-10-18 19~21시)를 상담하고 되묻기에 구조화된 답을 보낸다. 순서는 첫 온라인 측정 → 같은 모델이 로딩된 온라인 측정 → 해당 요청의 Ollama 연결을 차단한 템플릿 측정이다. 공용 Ollama 서버 프로세스는 종료하지 않는다.

모델을 명시적으로 내린 뒤 첫 로딩을 포함해 측정하려면 다음 명령을 사용한다. 선택한 모델만 기존 Ollama 클라이언트로 언로드한다.

```bash
node_modules/.bin/tsx services/gateway/tests/t304-manual-run.ts --cold
```

기록은 `/tmp/crowdcast-t304-manual-*/result.json`에 생성된다. 서비스 상태·지오코딩 예열 결과, 실제 호출의 HTTP 상태·소요 시간, LLM의 `loadMs`·입력 문자 수·해설 여부, 요청별 SSE 원본·순서 검사·시간을 담는다. `--cold`를 쓰지 않은 첫 측정은 이미 로딩됐을 수 있으므로 `loadMs`로 구분한다.

확인할 항목:

- 요청별 `problems=[]`, 순서 `gate A → forecast → gate B → gate publish → claim → evidence → suggest → done`.
- `timing.forecast`는 숫자 카드까지, `timing.claim`은 첫 발행 문장까지의 시간이다. 되묻기 응답 시간과 분석 요청 시간을 나눠 기록한다.
- 게이트 B·발행의 `passed=true`, `revision`·`masterVersion` 일치, 발행 문장 수와 `done.forecastId` 기록.
- 온라인 해설 `agent_step.usedLlm=true`, 성공 시 `근거 묶음으로 설명 초안을 만들었어요.`. 대체되면 note의 분류 코드를 확인한다. `usedLlm=true`만으로 생성 성공이라 기록하지 않는다.
- Ollama 차단 상담은 재검증된 템플릿으로 발행까지 완료한다. OOD 판정·권고는 제목이 `참고용 — 담당자 검토 필수`인 같은 예보의 검사 근거를 인용한다.
- Quantity 자리표시자의 인원은 `2,002~12,417명`처럼 표시한다. 판정 문구와 규칙 근거 원문은 forecast 응답 그대로이므로 그 안의 서식·중복 문구 수정은 T-204b 범위다.
- records의 행사/스냅샷 저장은 발행 뒤 호출되며 전체 5초와 요청 잔여 시간 안에서 성공하면 `snapshot-unavailable` 안내가 없어야 한다.

## 실제 knowledge 코드로 재검증

HTTP 통합 확인과 별도로, 가짜 서비스에 전송한 사실을 실제 knowledge 코드의 메모리 저장소에 넣어 게이트 B·발행을 확인할 수 있다.

```bash
T304_FACTS_OUT=/tmp/t304-facts.json npm -w services/gateway test -- tests/team-publish.test.ts -t '발행 승인 뒤'
T304_OOD_FACTS_OUT=/tmp/t304-ood-facts.json npm -w services/gateway test -- tests/team-gate-b.test.ts -t 'OOD 인용 없음'
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=services/knowledge/src .venv/bin/python services/gateway/tests/t304_knowledge_check.py /tmp/t304-facts.json
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=services/knowledge/src .venv/bin/python services/gateway/tests/t304_knowledge_check.py /tmp/t304-ood-facts.json
```

워크트리에 `.venv`가 없으면 마지막 두 명령의 Python 경로를 본 레포의 기존 `.venv/bin/python` 절대 경로로 바꾼다.

확률 문장은 이번 범위에서 만들지 않는다. `basis=확률`에서 확률 설명을 추가하려면 확률·임계값을 Quantity로 제공하는 후속 계약이 필요하다.
