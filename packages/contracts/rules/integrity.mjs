// 참조 무결성 규칙: 문서 안의 모든 참조가 같은 문서·세션 그래프·기준 그래프에 있는지 본다 — 계약 검사와 근거 그래프 적재(/facts)가 같은 판정을 쓴다
import { canonical, cardDiff } from "./card-projection.mjs";
import { factsTransitionProblems, publishProblems } from "./claim-lifecycle.mjs";

// 참조 칸 이름 → 찾을 곳(문서·세션에 정의된 것 또는 기준 그래프)
const REF_KEYS = {
  evidenceId: "evidence", evidenceIds: "evidence", quantityId: "quantities", quantityIds: "quantities",
  observationIds: "observations", assumptionId: "assumptions", assumptionIds: "assumptions", caseEventId: "caseEvents", claimIds: "claims",
  ruleId: "rules", ruleIds: "rules", clauseId: "clauses", datasetId: "datasets", modelRunId: "modelRuns",
};
const FROM_MASTER = new Set(["rules", "clauses", "datasets", "modelRuns"]);

// 정의로 모을 id 접두사 → 종류. 같은 id에 다른 내용이 오면 충돌(행사·예보도 세션 안에서 바뀌지 않는다), 문장만 수명 주기 전이를 허용한다
const DEF_PREFIX = { "q-": "quantities", "ev-": "evidence", "obs-": "observations", "as-": "assumptions", "c-": "claims", "e-": "events", "f-": "forecasts" };

// 자체 id가 없는 적재 객체(평시·유사 사례)는 자연 키로 식별한다: 평시 = 지역+기간, 유사 사례 = 과거 행사 id
const PART_KINDS = ["baselines", "similars"];
const baselineKey = (b) => `${b.sigunguCode}:${b.period.from}:${b.period.to}`;

// 기준 그래프 id 목록(master-ids.json)과 등록된 모델 실행 id로 조회용 집합을 만든다
export function masterSets(masterIds, modelRunIds = []) {
  const set = (k) => new Set(masterIds[k] ?? []);
  return { datasets: set("datasets"), clauses: set("clauses"), rules: set("rules"), assumptions: set("assumptions"), agents: set("agents"), modelRuns: new Set(modelRunIds) };
}

// 빈 정의 모음(세션 범위 하나)
function emptyDefs(sessionId = null) {
  const defs = { sessionId, caseEvents: new Set(), conflicts: [] };
  for (const kind of [...Object.values(DEF_PREFIX), ...PART_KINDS]) defs[kind] = new Map();
  return defs;
}

// 정의 모음을 복사한다(세션 범위를 건드리지 않고 문서 하나를 더해 보기 위해)
function copyDefs(d) {
  const out = emptyDefs(d.sessionId);
  out.revision = d.revision;
  out.caseEvents = new Set(d.caseEvents);
  for (const kind of [...Object.values(DEF_PREFIX), ...PART_KINDS]) out[kind] = new Map(d[kind]);
  return out;
}

// 문서를 훑어 정의(수치·근거·관측값·가정·문장·행사·예보 객체, 사례 id)를 모은다. 예보서의 숫자 카드는 예보의 투영이라 따로 보지 않는다(cardDiff)
function addDefinitions(defs, schema, doc, via = "facts") {
  const visit = (node, key) => {
    if (Array.isArray(node)) return node.forEach((x) => visit(x));
    if (!node || typeof node !== "object" || (schema === "forecast-report" && key === "card")) return;
    const prefix = typeof node.id === "string" ? Object.keys(DEF_PREFIX).find((p) => node.id.startsWith(p)) : undefined;
    if (prefix) {
      const kind = DEF_PREFIX[prefix];
      const prev = defs[kind].get(node.id);
      // 문장은 /facts 전이 규칙으로(예보서 안의 발행 문장은 스냅샷이라 같은 내용이어야 한다), 나머지는 내용이 같아야 한다
      if (kind === "claims" && schema === "claim") defs.conflicts.push(...(via === "publish" ? publishProblems(prev) : factsTransitionProblems(prev, node)));
      else if (prev && canonical(prev) !== canonical(node)) defs.conflicts.push(`같은 id ${node.id}에 다른 내용`);
      defs[kind].set(node.id, node);
    }
    for (const [k, v] of Object.entries(node)) visit(v, k);
  };
  visit(doc);
  // 평시·유사 사례: 자연 키가 같으면 내용도 같아야 한다(세션 안 불변)
  const part = (kind, key, node) => {
    const prev = defs[kind].get(key);
    if (prev && canonical(prev) !== canonical(node)) defs.conflicts.push(`같은 ${kind === "baselines" ? "평시" : "유사 사례"} ${key}에 다른 내용`);
    defs[kind].set(key, node);
  };
  const similars = schema === "similar-event" ? [doc] : schema === "forecast-report" ? doc.similar : [];
  const baselines = schema === "region-baseline" ? [doc] : schema === "forecast-report" && doc.baseline ? [doc.baseline] : [];
  for (const s of similars) { defs.caseEvents.add(s.eventId); part("similars", s.eventId, s); }
  for (const b of baselines) part("baselines", baselineKey(b), b);
}

// 세션 그래프에 이미 적재된 문서들로 세션 범위를 만든다(loaded = [{schema, doc, via}], 적재 순서대로, via = "facts" | "publish", revision = 지금 내용 revision)
export function sessionScope(sessionId, loaded, revision) {
  const defs = emptyDefs(sessionId);
  defs.revision = revision;
  for (const { schema, doc, via } of loaded) addDefinitions(defs, schema, doc, via);
  return defs;
}

// 이 적재가 세션의 내용 revision을 올리는지: 새 정의(id 객체·평시·유사 사례)가 하나라도 생기면 올린다. 같은 내용 재적재와 문장 상태 전이·재검사(같은 id)는 올리지 않는다
export function changesContent(scope, schema, doc) {
  const probe = emptyDefs();
  addDefinitions(probe, schema, doc);
  for (const kind of [...Object.values(DEF_PREFIX), ...PART_KINDS]) {
    for (const [id, node] of probe[kind]) {
      const prev = scope[kind].get(id);
      if (!prev) return true;
      if (kind !== "claims" && canonical(prev) !== canonical(node)) return true;
    }
  }
  return false;
}

// 문서 안의 모든 참조 칸을 {key, id, path}로 모은다
function refsIn(node, path = "", out = []) {
  if (Array.isArray(node)) node.forEach((x, i) => refsIn(x, `${path}[${i}]`, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (REF_KEYS[k]) for (const id of [v].flat()) if (typeof id === "string") out.push({ key: k, id, path: `${path}.${k}` });
      refsIn(v, `${path}.${k}`, out);
    }
  }
  return out;
}

// 문서 안의 모든 자리표시자가 가리키는 수치 칸이 null이 아닌지 본다
function placeholderProblems(node, quantities, out = []) {
  if (Array.isArray(node)) node.forEach((x) => placeholderProblems(x, quantities, out));
  else if (node && typeof node === "object") {
    for (const ph of Array.isArray(node.placeholders) ? node.placeholders : []) {
      const q = quantities.get(ph.quantityId);
      if (q && (q[ph.field] === null || q[ph.field] === undefined)) out.push(`${node.id} 자리표시자 ${ph.name} → ${ph.quantityId}.${ph.field}이 비었다`);
    }
    Object.values(node).forEach((v) => placeholderProblems(v, quantities, out));
  }
  return out;
}

// 참조 하나를 푼다: 기준 그래프 종류는 master에서, 나머지는 문서+세션 정의에서(가정은 정의가 없으면 기준 그래프)
function resolves(where, id, defs, master) {
  if (FROM_MASTER.has(where)) return master[where].has(id);
  if (where === "caseEvents") return defs.caseEvents.has(id);
  if (where === "assumptions" && defs.assumptions.size === 0) return master.assumptions.has(id);
  return defs[where].has(id);
}

// 목록의 id 집합
const ids = (xs) => new Set((xs ?? []).map((x) => x.id));

// 종류별 문맥 규칙: 예보·문장·근거가 어느 세션·예보·행사에 속하는지
function contextProblems(doc, kind, defs, master, scope) {
  const out = [];
  const forecastOf = (e) => (e.forecastId && !defs.forecasts.has(e.forecastId) ? [`evidence ${e.id} → 예보 ${e.forecastId} 없음`] : []);
  if (kind === "forecast") {
    if (scope && !scope.events.has(doc.eventId)) out.push(`forecast → 행사 ${doc.eventId}가 세션에 없음`);
    for (const e of doc.evidence) if (e.forecastId && e.forecastId !== doc.id) out.push(`evidence ${e.id} → 다른 예보 ${e.forecastId}`);
  }
  if (kind === "claim") {
    if (doc.sessionId !== defs.sessionId) out.push(`claim ${doc.id} → 다른 세션 ${doc.sessionId}`);
    if (!defs.forecasts.has(doc.forecastId)) out.push(`claim ${doc.id} → 예보 ${doc.forecastId} 없음`);
    if (!master.agents.has(`agent-${doc.generatedBy.agentId}`)) out.push(`claim ${doc.id} → 에이전트 ${doc.generatedBy.agentId} 기준 그래프에 없음`);
    // 검사 결과는 이미 있는 내용 revision에서만 나올 수 있다(scope.revision = 지금 내용 revision, 알 때만)
    if (scope?.revision !== undefined) for (const c of doc.checks) if (c.revision > scope.revision) out.push(`claim ${doc.id} ${c.checkKind} 검사 revision ${c.revision}은 아직 없다(지금 ${scope.revision})`);
  }
  if (kind === "evidence") out.push(...forecastOf(doc));
  if (kind === "similar-event" || kind === "region-baseline") {
    if (!ids(doc.evidence).has(doc.evidenceId)) out.push(`→ 근거 ${doc.evidenceId}가 자기 evidence에 없음`);
    for (const e of doc.evidence) out.push(...forecastOf(e));
  }
  if (kind === "forecast-report") out.push(...reportProblems(doc));
  return out;
}

// 발행된 예보서: 머리 일치, 카드 = 투영, 근거 묶음 = 합집합, 유사 행사·평시, 문장의 세션·예보
function reportProblems(doc) {
  const out = [];
  const f = doc.forecast;
  if (f.id !== doc.forecastId) out.push(`forecast.id ${f.id} ≠ forecastId ${doc.forecastId}`);
  if (f.eventId !== doc.event.id) out.push(`forecast.eventId ${f.eventId} ≠ event.id ${doc.event.id}`);
  const diff = cardDiff(doc.card, f);
  if (diff.length) out.push(`card가 forecast 투영과 다르다: ${diff.join("·")}`);
  const want = ids([...f.evidence, ...doc.similar.flatMap((s) => s.evidence), ...(doc.baseline?.evidence ?? [])]);
  const have = ids(doc.evidence);
  for (const e of want) if (!have.has(e)) out.push(`evidence 묶음에 ${e} 빠짐`);
  for (const e of have) if (!want.has(e)) out.push(`evidence 묶음에 출처 없는 ${e}`);
  for (const e of doc.evidence) if (e.forecastId && e.forecastId !== f.id) out.push(`evidence ${e.id} → 다른 예보 ${e.forecastId}`);
  for (const s of doc.similar) if (!ids(s.evidence).has(s.evidenceId)) out.push(`similar ${s.eventId} → 근거 ${s.evidenceId}가 자기 evidence에 없음`);
  if (doc.baseline) {
    if (!ids(doc.baseline.evidence).has(doc.baseline.evidenceId)) out.push(`baseline → 근거 ${doc.baseline.evidenceId}가 자기 evidence에 없음`);
    if (doc.baseline.sigunguCode !== doc.event.sigunguCode) out.push(`baseline 지역 ${doc.baseline.sigunguCode} ≠ 행사 지역 ${doc.event.sigunguCode}`);
  }
  for (const c of doc.claims) {
    if (c.sessionId !== doc.sessionId) out.push(`claim ${c.id} → 다른 세션 ${c.sessionId}`);
    if (c.forecastId !== doc.forecastId) out.push(`claim ${c.id} → 다른 예보 ${c.forecastId}`);
    // 발행 문장의 검사는 발행한 내용 revision에서 한 것이어야 한다
    for (const ck of c.checks) if (ck.revision !== doc.revision) out.push(`claim ${c.id} ${ck.checkKind} 검사 revision ${ck.revision} ≠ 발행 revision ${doc.revision}`);
  }
  return out;
}

// 끊긴 참조 목록을 돌려준다(빈 배열 = 통과). scope = 세션에 이미 있는 정의(sessionScope), 예보서는 스냅샷이라 scope 없이 자기 안에서만 푼다
export function refProblems(doc, kind, master, scope = null) {
  const defs = kind === "forecast-report" || !scope ? emptyDefs(scope?.sessionId ?? null) : copyDefs(scope);
  addDefinitions(defs, kind, doc);
  const out = [...defs.conflicts];
  for (const r of refsIn(doc)) if (!resolves(REF_KEYS[r.key], r.id, defs, master)) out.push(`${r.path} → ${r.id} 없음`);
  // 이 문서가 정의한 가정은 어디에 있든(예보서 안의 예보 포함) 기준 그래프에 등록돼 있어야 한다
  const own = emptyDefs();
  addDefinitions(own, kind, doc);
  for (const id of own.assumptions.keys()) if (!master.assumptions.has(id)) out.push(`assumption ${id} 기준 그래프에 없음`);
  out.push(...placeholderProblems(doc, defs.quantities));
  out.push(...contextProblems(doc, kind, defs, master, scope));
  return out;
}
