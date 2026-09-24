/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 펫을 누르면 보이는 작업 기록(M2-F3-c). 근거·문장은 id만 담는다
 */
export interface AgentStep {
  stepId: string;
  agentId:
    | "lead"
    | "dictation"
    | "local-guide"
    | "archivist"
    | "forecaster"
    | "source-check"
    | "number-check"
    | "rule-check"
    | "skeptic"
    | "explainer"
    | "card-maker"
    | "plan-writer"
    | "briefer";
  team: "lead" | "analysis" | "verification" | "report";
  startedAt: string;
  finishedAt: string | null;
  ms: number | null;
  status: "running" | "done" | "blocked" | "error";
  inputSummary: string;
  outputEvidenceIds: string[];
  outputClaimIds: string[];
  usedLlm: boolean;
  model: string | null;
  note: string;
}
