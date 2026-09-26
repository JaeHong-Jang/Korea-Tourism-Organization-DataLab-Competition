/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 작업판이 펫을 그리는 입력
 */
export interface AgentStatus {
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
  state: "idle" | "working" | "waiting" | "done" | "blocked" | "error";
  note: string;
  stepId: string | null;
  at: string;
}
