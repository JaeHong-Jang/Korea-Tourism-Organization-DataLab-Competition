// SSE 순서 규칙: 게이트를 지나기 전에는 숫자·문장·근거를 보내지 않는다 — 계약 검사와 게이트웨이 테스트(T-303)가 같은 판정을 쓴다

// 게이트 A 실패 뒤에도 보낼 수 있는 이벤트(팀원 상태·오류·끝)
const AFTER_FAIL_OK = new Set(["agent_status", "agent_step", "error", "done"]);

// 이벤트 목록을 앞에서부터 읽으며 규칙 위반을 모은다(빈 배열 = 통과)
export function sequenceProblems(events) {
  const out = [];
  const st = { gateA: null, gateB: false, gateBRuns: 0, publishChecked: false, published: false, done: false, card: null, claimEvidence: new Set(), sentEvidence: new Set() };
  events.forEach((e, i) => {
    const at = `#${i} ${e.event}`;
    // R1 seq는 0부터 1씩, R2 done 뒤에는 아무것도 없다
    if (e.seq !== i) out.push(`${at}: seq ${e.seq}(기대 ${i})`);
    if (st.done) out.push(`${at}: done 뒤에 이벤트`);
    // R3 게이트 A 실패 뒤에는 숫자·문장·근거·되묻기를 보내지 않는다
    if (st.gateA === false && !AFTER_FAIL_OK.has(e.event)) out.push(`${at}: 게이트 A 실패 뒤에 보냄`);
    if (e.event === "gate") {
      // R4 게이트 전이: A(한 번) → B(실패하면 다시 B, 최대 3번) → publish(한 번). 발행 검사 뒤에는 어떤 게이트도 없고, 스트림에는 integrity를 보내지 않는다
      const g = e.data.gate;
      if (st.publishChecked) out.push(`${at}: 발행 검사 뒤에 게이트 ${g}`);
      if (g === "A") {
        if (st.gateA !== null) out.push(`${at}: 게이트 A를 두 번`);
        st.gateA = e.data.passed;
      } else if (g === "B") {
        if (st.gateA !== true) out.push(`${at}: 게이트 A 통과 전에 게이트 B`);
        if (st.gateB) out.push(`${at}: 게이트 B 통과 뒤에 다시 게이트 B`);
        if (++st.gateBRuns > 3) out.push(`${at}: 게이트 B를 3번 넘게`);
        st.gateB = e.data.passed;
      } else if (g === "publish") {
        if (!st.gateB) out.push(`${at}: 게이트 B 통과 전에 발행 검사`);
        if (!st.card) out.push(`${at}: 숫자 카드 없이 발행 검사`);
        st.publishChecked = true;
        st.published = e.data.passed;
      } else out.push(`${at}: 스트림에 보낼 수 없는 게이트 ${g}`);
    } else if (e.event === "event_card" || e.event === "ask") {
      // R9 행사 카드·되묻기는 분석(게이트 A) 전에만
      if (st.gateA !== null) out.push(`${at}: 게이트 A 뒤에 보냄`);
    } else if (e.event === "forecast") {
      // R5 숫자 카드는 게이트 A 통과 뒤 한 번만
      if (st.gateA !== true) out.push(`${at}: 게이트 A 통과 전에 숫자 카드`);
      if (st.card) out.push(`${at}: 숫자 카드를 두 번 보냄`);
      st.card = e.data;
    } else if (e.event === "claim" || e.event === "evidence" || e.event === "suggest") {
      // R6 문장·근거·다음 할 일은 발행 검사 통과 뒤에만
      if (!st.published) out.push(`${at}: 발행 전에 보냄`);
      if (e.event === "claim") {
        if (st.card && e.data.forecastId !== st.card.id) out.push(`${at}: 문장의 예보 ${e.data.forecastId} ≠ 카드 ${st.card.id}`);
        for (const id of e.data.evidenceIds) st.claimEvidence.add(id);
      }
      if (e.event === "evidence") for (const it of e.data.items) st.sentEvidence.add(it.id);
    } else if (e.event === "done") {
      // R7 done의 forecastId는 발행했으면 카드 id, 아니면 null
      st.done = true;
      const want = st.published ? st.card?.id ?? null : null;
      if (e.data.forecastId !== want) out.push(`${at}: forecastId ${e.data.forecastId}(기대 ${want})`);
    }
  });
  // R8 끝 처리: done으로 끝나고, A 실패면 ANALYSIS_GATE_FAILED, 문장이 가리킨 근거는 모두 evidence로 보냈다
  if (!st.done) out.push("done으로 끝나지 않는다");
  if (st.gateA === false && !events.some((e) => e.event === "error" && e.data.code === "ANALYSIS_GATE_FAILED")) out.push("게이트 A 실패인데 ANALYSIS_GATE_FAILED 오류가 없다");
  for (const id of st.claimEvidence) if (!st.sentEvidence.has(id)) out.push(`문장이 가리킨 근거 ${id}를 evidence로 보내지 않았다`);
  return out;
}
