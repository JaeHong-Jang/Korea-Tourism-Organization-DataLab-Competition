// 내용 revision·기준 그래프 버전을 고정해 분석·설명 게이트를 검사한다

import type { Claim, Forecast, GateReport } from "@crowdcast/contracts/types";
import type { createKnowledgeClient } from "../../clients/knowledge-client.js";
import type { Executor } from "../runtime/executor.js";
import { numberCheck } from "../verification/number-check.js";
import { ruleCheck } from "../verification/rule-check.js";
import { hasReviewCitation, skeptic } from "../verification/skeptic.js";
import {
  hasKnownReferences,
  sourceCheck,
} from "../verification/source-check.js";

export const ANALYSIS_SHAPES = "S03,S04,S05,S06,S07,S08,S09";

// 무결성·검증 범위 충돌은 일반 서비스 장애와 구분해 숫자 전송을 막는다
export class AnalysisGateError extends Error {}

export const EXPLANATION_SHAPES = "S01,S02,S10,S11,S12";
// 설명 검증 실패는 분석 수치의 실패와 다른 종료 안내를 사용한다
export class ExplanationGateError extends Error {}

// 버전이나 게이트가 다른 승인은 재사용하지 않고 발행을 중단한다
export function requireGateScope(
  gate: GateReport,
  kind: "B" | "publish",
  revision: number,
  masterVersion: number,
) {
  if (
    gate.gate !== kind ||
    gate.revision !== revision ||
    gate.masterVersion !== masterVersion ||
    (gate.passed && gate.violations.length > 0)
  ) {
    throw new ExplanationGateError("설명 검증 범위가 일치하지 않습니다");
  }
}

// 재작성 전 이전 문장을 rejected로 바꾸되 내용 revision이 바뀌면 중단한다
export async function rejectClaims(
  knowledge: ReturnType<typeof createKnowledgeClient>,
  sessionId: string,
  claims: Claim[],
  revision: number,
) {
  if (!claims.length) return;
  const result = await knowledge.addFacts(sessionId, {
    schema: "claim",
    items: claims.map((claim) => ({ ...claim, status: "rejected" })),
  });
  if (result.revision !== revision)
    throw new ExplanationGateError(
      "문장 상태 전이에서 내용 revision이 바뀌었습니다",
    );
}

// 초안 적재·네 팀원 검사·후보 전이·고정 범위 SHACL을 한 게이트로 묶는다
export async function explanationGate(
  knowledge: ReturnType<typeof createKnowledgeClient>,
  sessionId: string,
  forecast: Forecast,
  drafts: Claim[],
  previous: Pick<GateReport, "revision" | "masterVersion">,
  execute: Executor,
) {
  // S10과 끊긴 참조는 rejected여도 그래프를 오염시키므로 적재 전에 확인한다
  const canLoad = drafts.every(
    (claim) =>
      hasKnownReferences(claim, forecast) && hasReviewCitation(claim, forecast),
  );
  let revision = previous.revision;
  if (canLoad) {
    const loaded = await knowledge.addFacts(sessionId, {
      schema: "claim",
      items: drafts,
    });
    if (loaded.revision !== revision + 1)
      throw new ExplanationGateError(
        "새 초안의 내용 revision이 일치하지 않습니다",
      );
    revision = loaded.revision;
  }

  // 한 검사의 실패도 숨기지 않고 모든 팀원의 작업 기록을 기다린다
  const input = { claims: drafts, forecast, revision };
  const results = await Promise.allSettled([
    execute(sourceCheck, input, "문장의 근거와 작성자를 확인해요.", 3),
    execute(numberCheck, input, "문장의 숫자와 단위를 대조해요.", 3),
    execute(ruleCheck, input, "판정 문구와 규칙을 대조해요.", 3),
    execute(skeptic, input, "구간 표시와 참고용 인용을 확인해요.", 3),
  ]);
  const checks = results.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
  const kinds = ["evidence", "number", "rule", "uncertainty"] as const;
  const claims = drafts.map(
    (claim, index): Claim => ({
      ...claim,
      status: "candidate",
      rendered: checks[1][index].rendered ?? claim.text,
      checks: kinds.map((checkKind, team) => ({
        checkKind,
        passed: checks[team][index].passed,
        revision,
      })),
    }),
  );
  const violations: GateReport["violations"] = [];
  for (const claim of claims)
    for (const check of claim.checks)
      if (!check.passed)
        violations.push({
          check: check.checkKind === "evidence" ? "shacl" : check.checkKind,
          shapeId: {
            evidence: "S01",
            number: "S02",
            rule: null,
            uncertainty: "S10",
          }[check.checkKind],
          nodeId: claim.id,
          message: `${check.checkKind} 문장 검사에 실패했어요.`,
        });

  // 근거 없는 candidate는 스키마가 거부하므로 초안 상태로 검증하고 묶음을 폐기한다
  const candidateLoaded =
    canLoad && claims.every((claim) => claim.evidenceIds.length > 0);
  if (candidateLoaded) {
    const result = await knowledge.addFacts(sessionId, {
      schema: "claim",
      items: claims,
    });
    if (result.revision !== revision)
      throw new ExplanationGateError(
        "후보 전이에서 내용 revision이 바뀌었습니다",
      );
  }
  const { masterVersion } = await knowledge.getMasterVersion();
  if (masterVersion < previous.masterVersion)
    throw new ExplanationGateError("기준 그래프 버전이 감소했습니다");
  const gate = await knowledge.validateSession(
    sessionId,
    revision,
    masterVersion,
    EXPLANATION_SHAPES,
  );
  requireGateScope(gate, "B", revision, masterVersion);
  if (!canLoad && !violations.length)
    violations.push({
      check: "integrity",
      shapeId: "S10",
      nodeId: sessionId,
      message: "초안 참조를 적재할 수 없어요.",
    });
  const combined = {
    ...gate,
    passed: gate.passed && !violations.length && candidateLoaded,
    violations: [...gate.violations, ...violations],
  };
  if (!combined.passed && canLoad)
    await rejectClaims(
      knowledge,
      sessionId,
      candidateLoaded ? claims : drafts,
      revision,
    );
  return { gate: combined, claims };
}

// 응답이 다른 범위를 검사했다면 passed 값과 관계없이 거부한다
export async function analysisGate(
  knowledge: ReturnType<typeof createKnowledgeClient>,
  sessionId: string,
  revision: number,
) {
  const { masterVersion } = await knowledge.getMasterVersion();
  const gate = await knowledge.validateSession(
    sessionId,
    revision,
    masterVersion,
    ANALYSIS_SHAPES,
  );
  if (
    gate.gate !== "A" ||
    gate.revision !== revision ||
    gate.masterVersion !== masterVersion ||
    (gate.passed && gate.violations.length > 0)
  ) {
    throw new AnalysisGateError("분석 검증 범위가 일치하지 않습니다");
  }
  return gate;
}
