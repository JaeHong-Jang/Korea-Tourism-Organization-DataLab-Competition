// 문장(Claim) 수명 주기: 같은 id로 허용되는 상태 전이와 바뀌면 안 되는 칸 — 근거 그래프 적재(/facts)·발행(/publish)·계약 검사가 같은 판정을 쓴다
import { canonical } from "./card-projection.mjs";

// /facts로 허용되는 전이(이전 → 다음). 발행(candidate → published)은 /publish만 한다
const FACTS_TRANSITIONS = { draft: new Set(["candidate", "rejected"]), candidate: new Set(["rejected"]) };

// 전이해도 바뀌면 안 되는 칸(재작성은 새 id로 한다 — 이전 id는 rejected)
const FROZEN = ["sessionId", "forecastId", "text", "claimType", "evidenceIds", "placeholders", "generatedBy"];

// /facts 적재 한 번의 문제: 새 문장은 draft로만 들어오고, 기존 문장은 허용 전이만(같은 내용 재적재는 그대로 통과)
export function factsTransitionProblems(prev, next) {
  if (!prev) return next.status === "draft" ? [] : [`claim ${next.id}: 새 문장은 draft로만 적재한다(받은 상태 ${next.status})`];
  if (canonical(prev) === canonical(next)) return [];
  const out = [];
  for (const k of FROZEN) if (canonical(prev[k]) !== canonical(next[k])) out.push(`claim ${next.id}: ${k}는 바꿀 수 없다(재작성은 새 id로)`);
  if (prev.status === next.status) out.push(`claim ${next.id}: 상태 ${prev.status} 그대로 내용을 바꿀 수 없다`);
  else if (next.status === "published") out.push(`claim ${next.id}: 발행은 /publish로만 한다`);
  else if (!FACTS_TRANSITIONS[prev.status]?.has(next.status)) out.push(`claim ${next.id}: ${prev.status} → ${next.status} 전이는 허용되지 않는다`);
  return out;
}

// /publish 한 번의 문제: candidate만, 검사가 모두 통과했고 검사한 revision이 지금 내용 revision과 같아야 published가 된다(S12의 핵심)
export function publishProblems(prev, revision) {
  if (!prev) return ["없는 문장은 발행할 수 없다"];
  if (prev.status !== "candidate") return [`claim ${prev.id}: ${prev.status} 상태는 발행할 수 없다(candidate만)`];
  const out = [];
  for (const c of prev.checks) {
    if (!c.passed) out.push(`claim ${prev.id}: ${c.checkKind} 검사 실패`);
    if (revision !== undefined && c.revision !== revision) out.push(`claim ${prev.id}: ${c.checkKind} 검사가 revision ${c.revision} 기준(지금 ${revision}) — 다시 검사해야 한다`);
  }
  return out;
}

// 발행 결과: 상태만 published로 바꾼 사본
export const published = (prev) => ({ ...prev, status: "published" });
