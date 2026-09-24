// SSE 순서 규칙: 게이트를 지나기 전에는 숫자·문장·근거를 보내지 않는다 — 계약 검사와 게이트웨이 테스트(T-303)가 같은 판정을 쓴다

// 게이트 A 실패 뒤에도 보낼 수 있는 이벤트(팀원 상태·오류·끝)
const AFTER_FAIL_OK = new Set(["agent_status", "agent_step", "error", "done"]);

// 이벤트 목록을 앞에서부터 읽으며 규칙 위반을 모은다(빈 배열 = 통과).
// ctx.mode = "new"(새 예보·what-if: A → B → 발행) | "followup"(발행된 예보 ctx.forecastId에 대한 설명·초안: B → 발행, 10 §3 다른 플레이북)
export function sequenceProblems(events, ctx = { mode: "new" }) {
  const out = [];
  const followup = ctx.mode === "followup";
  if (followup && !ctx.forecastId) out.push("후속 요청에는 기존 예보 id가 필요하다");
  const st = { gateA: followup ? true : null, gateB: false, gateBFails: 0, publishChecked: false, published: false, done: false,
    card: followup ? { id: ctx.forecastId } : null, claimEvidence: new Set(), sentEvidence: new Set() };
  events.forEach((e, i) => {
    const at = `#${i} ${e.event}`;
    // R1 seq는 0부터 1씩, R2 done 뒤에는 아무것도 없다
    if (e.seq !== i) out.push(`${at}: seq ${e.seq}(기대 ${i})`);
    if (st.done) out.push(`${at}: done 뒤에 이벤트`);
    // R3 게이트 A 실패 뒤에는 숫자·문장·근거·되묻기를 보내지 않는다
    if (st.gateA === false && !AFTER_FAIL_OK.has(e.event)) out.push(`${at}: 게이트 A 실패 뒤에 보냄`);
    if (e.event === "gate") {
      // R4 게이트 전이: A(한 번) → B(실패 뒤 재작성하거나, 새 사실로 revision이 오르면 다시) → publish(한 번). 발행 검사 뒤에는 어떤 게이트도 없고, 스트림에는 integrity를 보내지 않는다
      const g = e.data.gate;
      if (st.publishChecked) out.push(`${at}: 발행 검사 뒤에 게이트 ${g}`);
      // R11 게이트의 내용 revision은 스트림 안에서 줄지 않는다
      if (st.lastGateRevision !== undefined && e.data.revision < st.lastGateRevision) out.push(`${at}: revision ${e.data.revision}이 앞 게이트(${st.lastGateRevision})보다 작다`);
      st.lastGateRevision = e.data.revision;
      if (g === "A") {
        if (followup) out.push(`${at}: 후속 요청에는 게이트 A가 없다(숫자는 이미 발행됨)`);
        else if (st.gateA !== null) out.push(`${at}: 게이트 A를 두 번`);
        st.gateA = e.data.passed;
      } else if (g === "B") {
        // B는 실패 뒤(재작성·템플릿, 실패는 최대 2번까지 다시), 또는 통과 뒤 새 사실로 내용 revision이 올랐을 때(재검사) 다시 한다
        if (st.gateA !== true) out.push(`${at}: 게이트 A 통과 전에 게이트 B`);
        if (st.gateB && !(e.data.revision > st.gateBRevision)) out.push(`${at}: 내용이 그대로인데(revision ${e.data.revision}) 통과한 게이트 B를 다시`);
        if (!e.data.passed && ++st.gateBFails > 2) out.push(`${at}: 게이트 B 실패가 2번을 넘음(재작성 1회 → 템플릿 뒤에는 오류로 끝낸다)`);
        st.gateB = e.data.passed;
        st.gateBRevision = e.data.revision;
        st.gateBMaster = e.data.masterVersion;
      } else if (g === "publish") {
        if (!st.gateB) out.push(`${at}: 게이트 B 통과 전에 발행 검사`);
        // R10 발행 검사는 게이트 B가 본 내용 revision에서 한다(그 사이 새 사실이 들어오면 다시 검사)
        if (st.gateB && e.data.revision !== st.gateBRevision) out.push(`${at}: 발행 검사 revision ${e.data.revision} ≠ 게이트 B revision ${st.gateBRevision}`);
        if (st.gateB && e.data.masterVersion !== st.gateBMaster) out.push(`${at}: 발행 검사 masterVersion ${e.data.masterVersion} ≠ 게이트 B masterVersion ${st.gateBMaster}`);
        st.publishRevision = e.data.revision;
        if (!st.card) out.push(`${at}: 숫자 카드 없이 발행 검사`);
        st.publishChecked = true;
        st.published = e.data.passed;
      } else out.push(`${at}: 스트림에 보낼 수 없는 게이트 ${g}`);
    } else if (e.event === "event_card" || e.event === "ask") {
      // R9 행사 카드·되묻기는 새 예보의 분석(게이트 A) 전에만
      if (followup) out.push(`${at}: 후속 요청에서 행사 정보를 다시 받지 않는다`);
      else if (st.gateA !== null) out.push(`${at}: 게이트 A 뒤에 보냄`);
    } else if (e.event === "forecast") {
      // R5 숫자 카드는 새 예보에서 게이트 A 통과 뒤 한 번만(후속 요청은 이미 발행된 카드를 쓴다)
      if (followup) out.push(`${at}: 후속 요청에서 숫자 카드를 다시 보내지 않는다`);
      else {
        if (st.gateA !== true) out.push(`${at}: 게이트 A 통과 전에 숫자 카드`);
        if (st.card) out.push(`${at}: 숫자 카드를 두 번 보냄`);
        st.card = e.data;
      }
    } else if (e.event === "claim" || e.event === "evidence" || e.event === "suggest") {
      // R6 문장·근거·다음 할 일은 발행 검사 통과 뒤에만
      if (!st.published) out.push(`${at}: 발행 전에 보냄`);
      if (e.event === "claim") {
        if (st.card && e.data.forecastId !== st.card.id) out.push(`${at}: 문장의 예보 ${e.data.forecastId} ≠ 카드 ${st.card.id}`);
        for (const id of e.data.evidenceIds) st.claimEvidence.add(id);
        for (const c of e.data.checks) if (st.publishRevision !== undefined && c.revision !== st.publishRevision) out.push(`${at}: 문장 ${e.data.id}의 ${c.checkKind} 검사 revision ${c.revision} ≠ 발행 revision ${st.publishRevision}`);
      }
      if (e.event === "evidence") for (const it of e.data.items) st.sentEvidence.add(it.id);
    } else if (e.event === "done") {
      // R7 done의 forecastId는 발행했으면 카드 id, 아니면 null
      st.done = true;
      const want = followup ? ctx.forecastId : st.published ? st.card?.id ?? null : null;
      if (e.data.forecastId !== want) out.push(`${at}: forecastId ${e.data.forecastId}(기대 ${want})`);
    }
  });
  // R8 끝 처리: done으로 끝나고, A 실패면 ANALYSIS_GATE_FAILED, 문장이 가리킨 근거는 모두 evidence로 보냈다
  if (!st.done) out.push("done으로 끝나지 않는다");
  if (st.gateA === false && !events.some((e) => e.event === "error" && e.data.code === "ANALYSIS_GATE_FAILED")) out.push("게이트 A 실패인데 ANALYSIS_GATE_FAILED 오류가 없다");
  for (const id of st.claimEvidence) if (!st.sentEvidence.has(id)) out.push(`문장이 가리킨 근거 ${id}를 evidence로 보내지 않았다`);
  return out;
}
