// 발행 문장을 검사 맥락으로 재사용하고 새 설명만 게이트 B와 발행에 넘긴다
import { ServiceHttpError } from "../../clients/request-json.js";
import { whyExplainer } from "../report/why-templates.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { Deadline } from "./deadline.js";
import {
  ExplanationGateError,
  explanationGate,
  rejectClaims,
  requireGateScope,
} from "./gates.js";
import { approvePublication, knowledgeClient } from "./publish.js";

// 실패한 후보는 본문·검사 결과를 보존해 폐기하고 통신 실패면 다음 요청에 남긴다
async function rejectPending(
  session: TeamSession,
  client: ReturnType<typeof knowledgeClient>,
) {
  const published = session.published;
  if (!published?.pendingClaims?.length) return;
  try {
    await rejectClaims(
      client,
      session.id,
      published.pendingClaims,
      published.revision,
    );
  } catch (error) {
    // 전이 거부(422)는 이미 후보가 아니라는 뜻이다(발행은 됐는데 응답만 유실) — S12를 막지 않으니 목록에서 뺀다
    if (!(error instanceof ServiceHttpError && error.status === 422))
      throw error;
  }
  published.pendingClaims = [];
}

// 이전 판정·권고·구간 고지는 다시 적재하지 않고 같은 검증팀의 완결성 검사에만 쓴다
export async function explainWhy(
  session: TeamSession,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
) {
  const published = session.published;
  if (!published) throw new ExplanationGateError("발행 묶음이 없습니다");
  const client = knowledgeClient(settings, deadline);
  await rejectPending(session, client);
  const { report } = published;
  const drafts = await execute(
    whyExplainer,
    report,
    "예보의 이유를 근거에서 찾아요.",
  );
  const step = session.steps.at(-1);
  if (
    step?.agentId !== "explainer" ||
    !drafts.length ||
    drafts.some((claim) => /\p{N}/u.test(claim.text))
  )
    throw new ExplanationGateError("숫자 없는 설명을 만들지 못했어요");
  for (const claim of drafts) claim.generatedBy.stepId = step.stepId;
  const newIds = new Set(drafts.map((claim) => claim.id));

  // 내용 적재 뒤 검증이 실패해도 다음 요청은 실제 그래프 revision에서 이어 간다
  const knowledge: typeof client = {
    ...client,
    // 기존 published 문장은 검사 입력으로만 쓰고 저장소의 상태·검사 결과는 바꾸지 않는다
    async addFacts(id, facts) {
      const incoming =
        facts.schema === "claim"
          ? {
              ...facts,
              items: facts.items.filter((claim) => newIds.has(claim.id)),
            }
          : facts;
      // 후보 전이 응답이 유실되어도 보낸 후보를 다음 요청에서 폐기할 수 있게 보관한다
      if (incoming.schema === "claim") {
        const candidates = incoming.items.filter(
          (claim) => claim.status === "candidate",
        );
        if (candidates.length) published.pendingClaims = candidates;
      }
      const loaded = await client.addFacts(id, incoming);
      published.revision = loaded.revision;
      // 게이트 B 자체가 폐기한 후보는 다시 정리할 필요가 없다
      if (incoming.schema === "claim") {
        const rejected = new Set(
          incoming.items
            .filter((claim) => claim.status === "rejected")
            .map((claim) => claim.id),
        );
        published.pendingClaims = published.pendingClaims?.filter(
          (claim) => !rejected.has(claim.id),
        );
      }
      return loaded;
    },
    // 발행 응답을 확인한 즉시 후보를 비워 이후 SSE 전송 실패가 발행 문장을 폐기하지 않게 한다
    async publishSession(id, revision, masterVersion) {
      const result = await client.publishSession(id, revision, masterVersion);
      requireGateScope(result, "publish", revision, masterVersion);
      if (result.passed) published.pendingClaims = [];
      return result;
    },
  };
  let approved: Awaited<ReturnType<typeof explanationGate>>;
  try {
    approved = await explanationGate(
      knowledge,
      session.id,
      { ...report.forecast, evidence: report.evidence },
      [...drafts, ...report.claims],
      { revision: published.revision, masterVersion: published.masterVersion },
      execute,
    );
    published.masterVersion = approved.gate.masterVersion;
    await writer.emit("gate", approved.gate);
    if (!approved.gate.passed)
      throw new ExplanationGateError("설명 문장을 검증하지 못했어요");
    await approvePublication(knowledge, session.id, approved.gate, writer);
  } catch (error) {
    // 발행·검사 장애 뒤 남은 후보가 다음 내용 revision의 S12를 막지 않게 정리한다
    await rejectPending(session, client);
    throw error;
  }

  // 발행 승인 뒤 새 설명과 그 인용 근거만 보내고 최초 스냅샷은 보존한다
  const claims = approved.claims.filter((claim) => newIds.has(claim.id));
  const evidenceIds = new Set(claims.flatMap((claim) => claim.evidenceIds));
  for (const claim of claims)
    await writer.emit("claim", { ...claim, status: "published" });
  await writer.emit("evidence", {
    items: report.evidence.filter((item) => evidenceIds.has(item.id)),
  });
  await writer.emit("suggest", {
    actions: [
      { id: "save", label: "예보서 저장" },
      { id: "draft", label: "계획 초안" },
    ],
  });
}
