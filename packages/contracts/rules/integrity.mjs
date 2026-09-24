// 참조 무결성 규칙: 문서 안에서 가리키는 id가 같은 문서나 기준 그래프에 있는지 본다 — 계약 검사와 근거 그래프 적재(/facts)가 같은 판정을 쓴다
import { cardDiff } from "./card-projection.mjs";

// 기준 그래프 id 목록(master-ids.json)과 등록된 모델 실행 id로 조회용 집합을 만든다
export function masterSets(masterIds, modelRunIds = []) {
  const set = (k) => new Set(masterIds[k] ?? []);
  return { datasets: set("datasets"), clauses: set("clauses"), rules: set("rules"), assumptions: set("assumptions"), agents: set("agents"), modelRuns: new Set(modelRunIds) };
}

// 문서 전체에서 수치 노드(id가 q-로 시작하는 객체)를 모은다 — 유사 행사 실측·주최측 예상도 자리표시자 대상이 된다
function collectQuantities(node, out = new Map()) {
  if (Array.isArray(node)) for (const x of node) collectQuantities(x, out);
  else if (node && typeof node === "object") {
    if (typeof node.id === "string" && node.id.startsWith("q-")) out.set(node.id, node);
    for (const v of Object.values(node)) collectQuantities(v, out);
  }
  return out;
}

// 목록의 id 집합
const ids = (xs) => new Set((xs ?? []).map((x) => x.id));

// 근거 조각의 참조: 수치·규칙·조항·가정·데이터셋·예보·사례
function evidenceProblems(list, ctx) {
  const out = [];
  for (const e of list ?? []) {
    for (const q of e.quantityIds ?? []) if (!ctx.qty.has(q)) out.push(`evidence ${e.id} → 수치 ${q} 없음`);
    if (e.ruleId && !ctx.master.rules.has(e.ruleId)) out.push(`evidence ${e.id} → 규칙 ${e.ruleId} 기준 그래프에 없음`);
    if (e.clauseId && !ctx.master.clauses.has(e.clauseId)) out.push(`evidence ${e.id} → 조항 ${e.clauseId} 기준 그래프에 없음`);
    if (e.assumptionId && !(ctx.asm ?? ctx.master.assumptions).has(e.assumptionId)) out.push(`evidence ${e.id} → 가정 ${e.assumptionId} 없음`);
    if (e.source && !ctx.master.datasets.has(e.source.datasetId)) out.push(`evidence ${e.id} → 데이터셋 ${e.source.datasetId} 기준 그래프에 없음`);
    if (e.forecastId && ctx.forecastId && e.forecastId !== ctx.forecastId) out.push(`evidence ${e.id} → 다른 예보 ${e.forecastId}`);
    if (e.caseEventId && ctx.caseEvents && !ctx.caseEvents.has(e.caseEventId)) out.push(`evidence ${e.id} → 유사 행사 ${e.caseEventId} 없음`);
  }
  return out;
}

// 예보 한 건: 계보(관측값·모델 실행), 요인·판정·체크리스트 근거, 규칙·조항, 가정, 근거 조각
function forecastProblems(f, master, qty, caseEvents) {
  const out = [];
  const ev = ids(f.evidence);
  const obs = ids(f.observations);
  const asm = ids(f.assumptions);
  for (const o of f.predictionRun?.observationIds ?? []) if (!obs.has(o)) out.push(`predictionRun → 관측값 ${o} 없음`);
  if (f.predictionRun && !master.modelRuns.has(f.predictionRun.modelRunId)) out.push(`predictionRun → 모델 실행 ${f.predictionRun.modelRunId} 등록 안 됨`);
  for (const o of f.observations ?? []) if (!master.datasets.has(o.datasetId)) out.push(`observation ${o.id} → 데이터셋 ${o.datasetId} 기준 그래프에 없음`);
  for (const fa of f.factors ?? []) for (const e of fa.evidenceIds) if (!ev.has(e)) out.push(`factor ${fa.id} → 근거 ${e} 없음`);
  for (const r of f.judgment?.ruleIds ?? []) if (!master.rules.has(r)) out.push(`judgment → 규칙 ${r} 기준 그래프에 없음`);
  for (const r of f.judgment?.reasons ?? []) {
    if (!ev.has(r.evidenceId)) out.push(`reason ${r.ruleId} → 근거 ${r.evidenceId} 없음`);
    if (!master.rules.has(r.ruleId)) out.push(`reason → 규칙 ${r.ruleId} 기준 그래프에 없음`);
    if (r.clauseId && !master.clauses.has(r.clauseId)) out.push(`reason ${r.ruleId} → 조항 ${r.clauseId} 기준 그래프에 없음`);
  }
  for (const ck of f.judgment?.checklist ?? []) {
    for (const e of ck.evidenceIds) if (!ev.has(e)) out.push(`checklist ${ck.id} → 근거 ${e} 없음`);
    if (ck.ruleId && !master.rules.has(ck.ruleId)) out.push(`checklist ${ck.id} → 규칙 ${ck.ruleId} 기준 그래프에 없음`);
  }
  for (const a of f.assumptions ?? []) if (!master.assumptions.has(a.id)) out.push(`assumption ${a.id} 기준 그래프에 없음`);
  for (const q of [f.dailyMean, f.peakConcurrent]) for (const a of q?.assumptionIds ?? []) if (!asm.has(a)) out.push(`${q.id} → 가정 ${a} 없음`);
  out.push(...evidenceProblems(f.evidence, { qty, asm, master, forecastId: f.id, caseEvents }));
  return out;
}

// 발행 문장: 세션·예보 일치, 근거, 자리표시자 대상(수치 노드의 그 칸이 null이 아니어야)
function claimProblems(c, ctx) {
  const out = [];
  if (ctx.sessionId && c.sessionId !== ctx.sessionId) out.push(`claim ${c.id} → 다른 세션 ${c.sessionId}`);
  if (ctx.forecastId && c.forecastId !== ctx.forecastId) out.push(`claim ${c.id} → 다른 예보 ${c.forecastId}`);
  for (const e of c.evidenceIds) if (!ctx.ev.has(e)) out.push(`claim ${c.id} → 근거 ${e} 없음`);
  for (const ph of c.placeholders) {
    const target = ctx.qty.get(ph.quantityId);
    if (!target || target[ph.field] === null || target[ph.field] === undefined) out.push(`claim ${c.id} 자리표시자 ${ph.name} → ${ph.quantityId}.${ph.field} 없음`);
  }
  return out;
}

// 발행된 예보서: 머리 일치, 카드 = 투영, 근거 묶음 = 합집합, 유사 행사·평시, 문장, 배치·요약
function reportProblems(doc, master) {
  const f = doc.forecast;
  const qty = collectQuantities(doc);
  const caseEvents = new Set(doc.similar.map((s) => s.eventId));
  const out = forecastProblems(f, master, qty, caseEvents);
  if (f.id !== doc.forecastId) out.push(`forecast.id ${f.id} ≠ forecastId ${doc.forecastId}`);
  if (f.eventId !== doc.event.id) out.push(`forecast.eventId ${f.eventId} ≠ event.id ${doc.event.id}`);
  const diff = cardDiff(doc.card, f);
  if (diff.length) out.push(`card가 forecast 투영과 다르다: ${diff.join("·")}`);
  const parts = [...f.evidence, ...doc.similar.flatMap((s) => s.evidence), ...(doc.baseline?.evidence ?? [])];
  const want = ids(parts);
  const ev = ids(doc.evidence);
  for (const e of want) if (!ev.has(e)) out.push(`evidence 묶음에 ${e} 빠짐`);
  for (const e of ev) if (!want.has(e)) out.push(`evidence 묶음에 출처 없는 ${e}`);
  out.push(...evidenceProblems(doc.evidence.filter((e) => !ids(f.evidence).has(e.id)), { qty, master, forecastId: f.id, caseEvents }));
  for (const s of doc.similar) if (!ids(s.evidence).has(s.evidenceId)) out.push(`similar ${s.eventId} → 근거 ${s.evidenceId}가 자기 evidence에 없음`);
  if (doc.baseline) {
    if (!ids(doc.baseline.evidence).has(doc.baseline.evidenceId)) out.push(`baseline → 근거 ${doc.baseline.evidenceId}가 자기 evidence에 없음`);
    if (doc.baseline.sigunguCode !== doc.event.sigunguCode) out.push(`baseline 지역 ${doc.baseline.sigunguCode} ≠ 행사 지역 ${doc.event.sigunguCode}`);
  }
  const claims = ids(doc.claims);
  for (const c of doc.claims) out.push(...claimProblems(c, { sessionId: doc.sessionId, forecastId: doc.forecastId, ev, qty }));
  for (const l of doc.layout) {
    for (const c of l.claimIds) if (!claims.has(c)) out.push(`layout ${l.slot} → 문장 ${c} 없음`);
    for (const e of l.evidenceIds) if (!ev.has(e)) out.push(`layout ${l.slot} → 근거 ${e} 없음`);
  }
  for (const c of doc.brief.claimIds) if (!claims.has(c)) out.push(`brief → 문장 ${c} 없음`);
  return out;
}

// 유사 행사·평시: 자기 근거 조각의 참조
function partProblems(doc, master) {
  const out = evidenceProblems(doc.evidence, { qty: collectQuantities(doc), master, caseEvents: doc.eventId ? new Set([doc.eventId]) : undefined });
  if (!ids(doc.evidence).has(doc.evidenceId)) out.push(`→ 근거 ${doc.evidenceId}가 자기 evidence에 없음`);
  return out;
}

// 스키마 이름에 맞는 규칙으로 끊긴 참조 목록을 돌려준다(빈 배열 = 통과)
export function refProblems(doc, kind, master) {
  if (kind === "forecast") return forecastProblems(doc, master, collectQuantities(doc));
  if (kind === "forecast-report") return reportProblems(doc, master);
  if (kind === "similar-event" || kind === "region-baseline") return partProblems(doc, master);
  return [];
}
