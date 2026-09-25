// 한 번 받은 게이트 A 결과를 팀원의 담당 모양과 검사 근거로 요약한다
import type { Evidence, GateReport } from "@crowdcast/contracts/types";
import type { AgentResult } from "../runtime/agent.js";

export type AnalysisCheckInput = {
  gate: GateReport;
  evidence: Evidence[];
};

// 원문 위반 메시지를 노출하지 않고 담당 모양의 위반만 작업 상태에 반영한다
export function analysisCheck(
  input: AnalysisCheckInput,
  shapes: string[],
  evidence: Evidence[],
  doneNote: string,
): AgentResult<null> {
  const violations = input.gate.violations.filter(
    ({ shapeId }) => shapeId !== null && shapes.includes(shapeId),
  );
  const failedShapes = shapes.filter((shape) =>
    violations.some(({ shapeId }) => shapeId === shape),
  );
  return {
    value: null,
    status: violations.length ? "blocked" : "done",
    evidenceIds: evidence.map((item) => item.id),
    note: violations.length
      ? `${failedShapes.join("·")} 위반 ${violations.length}건을 찾았어요.`
      : doneNote,
  };
}
