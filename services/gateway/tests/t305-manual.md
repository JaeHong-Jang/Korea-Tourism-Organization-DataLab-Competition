<!-- T-305 후속 상담의 자동 검증과 오케스트레이터 실사용 재현 명령을 기록한다 -->
# T-305 재현

자동 검증은 L3 루트에서 실행한다. 소켓이 차단된 워커에서는 전체 테스트 중 `proxy-http.test.ts` 세 건과 서비스 기동 확인이 `listen EPERM`으로 실패하므로 오케스트레이터 환경에서 다시 실행한다.

```bash
npm -w services/gateway test
npm -w services/gateway run build
npm -w services/gateway run lint
node scripts/dev.mjs --check --only gateway
```

소켓을 열지 않는 후속 시나리오와 기존 테스트:

```bash
npm -w services/gateway test -- --exclude tests/proxy-http.test.ts
```

실제 knowledge 코드의 메모리 저장소에 최초 발행 → why → why 요청을 순서대로 넣어 SHACL과 발행을 확인한다. 공유 산출물은 변경하지 않는다. `.venv`가 없는 워크트리에서는 Python 실행 경로를 본 레포의 기존 `.venv/bin/python`으로 바꾼다.

```bash
T305_CALLS_OUT=/tmp/t305-calls.json npm -w services/gateway test -- tests/team-followup-why.test.ts -t '같은 이유 질문'
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=services/knowledge/src .venv/bin/python services/gateway/tests/t305_knowledge_check.py /tmp/t305-calls.json
```

발행 실패 뒤 후보 정리와 다음 why의 발행도 실제 SHACL로 재생한다. 실패를 주입한 `/publish` 호출은 저장소에 반영하지 않고, 게이트웨이가 보낸 `candidate → rejected` 요청과 다음 설명은 그대로 적용한다. 모든 게이트 통과와 최종 candidate가 없는 상태를 확인한다.

```bash
T305_RECOVERY_CALLS_OUT=/tmp/t305-recovery-calls.json npm -w services/gateway test -- tests/team-followup-recovery.test.ts -t 'publish-http'
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=services/knowledge/src .venv/bin/python services/gateway/tests/t305_knowledge_check.py /tmp/t305-recovery-calls.json
```

실사용은 오케스트레이터가 실제 forecast·knowledge·records·Ollama와 gateway를 준비한 뒤 실행한다. 다음 명령은 같은 상담에서 최초 발행과 후속 요청을 보내고 요청별 SSE를 터미널에 출력한다. 최초 예보가 발행되지 않으면 중단한다.

```bash
node --input-type=module <<'JS'
const base = process.env.GATEWAY_ORIGIN ?? 'http://127.0.0.1:8787';
const created = await fetch(`${base}/api/team/sessions`, { method: 'POST' });
if (!created.ok) throw new Error(`세션 생성 실패: ${created.status}`);
const { sessionId } = await created.json();
async function send(message) {
  const response = await fetch(`${base}/api/team/sessions/${sessionId}/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message),
  });
  if (!response.ok) throw new Error(`상담 실패: ${response.status}`);
  const stream = await response.text();
  console.log(stream);
  return stream.trim().split('\n\n').map(frame => JSON.parse(frame.split('\n').find(line => line.startsWith('data: ')).slice(6)));
}
await send({ text: '2026년 10월 18일 19~21시 인천 중구 영종 씨사이드파크에서 영종 불꽃축제를 열어요. 무료이고 주최는 인천 중구청입니다. 예산 2억원, 폭죽을 사용해요.' });
const published = await send({ text: '위험요소 확인', answer: { hazards: ['폭죽'] } });
const forecastId = published.at(-1)?.data.forecastId;
if (!forecastId) throw new Error('최초 예보 미발행: 위 되묻기·오류를 먼저 확인하세요');
for (const text of ['왜 이렇게 많아?', '왜 이렇게 많아?', '저장해 줘', '계획 초안 만들어 줘', '비 오면?', '다른 행사 예보를 해 줘', '내일 날씨 어때?', '이유를 설명하고 저장해 줘']) {
  const events = await send({ text });
  if (events.at(-1)?.data.forecastId !== forecastId) throw new Error('후속 예보 id 불일치');
}
JS
```

why 두 요청은 LLM 없이 `B → publish → claim → evidence → suggest → done`으로 끝나야 한다. 발행된 문장은 요인 라벨 또는 지정 템플릿이고 숫자가 없으며 모든 근거가 전달되어야 한다. 두 요청의 문장 id는 다르고 본문·근거는 같다. 저장은 기존 스냅샷을 조회하며 초안·whatif·범위 안내에도 `done.forecastId`가 유지되어야 한다. 분류 원문은 작업 기록에 남기지 않는다.

미저장 재시도·서비스 장애·분류 시간 초과·게이트 차단·KST 자정은 `team-followup-*.test.ts`와 `team-request-date.test.ts`의 가짜 서비스로 재현한다. 실제 저장 스냅샷을 삭제하지 않는다.
