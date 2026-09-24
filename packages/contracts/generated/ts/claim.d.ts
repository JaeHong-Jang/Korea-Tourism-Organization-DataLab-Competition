/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 설명·판정·권고 문장. 발행 후보·발행이면 근거·검사·렌더 결과가 있어야 한다
 */
export type Claim = {
  [k: string]: unknown;
} & {
  id: string;
  sessionId: string;
  forecastId: string;
  text: string;
  rendered: string | null;
  claimType: "판정" | "수치" | "요인" | "권고" | "설명";
  status: "draft" | "candidate" | "published" | "rejected";
  evidenceIds: string[];
  placeholders: {
    name: string;
    quantityId: string;
    field: "value" | "p10" | "p50" | "p90";
  }[];
  generatedBy: {
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
    stepId: string;
  };
  checks: {
    checkKind: "evidence" | "number" | "rule" | "uncertainty";
    passed: boolean;
    revision: number;
  }[];
};
