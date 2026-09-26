/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 운영 화면(M8-F1)
 */
export interface PipelineRun {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "passed" | "failed";
  stages: {
    name: "fetch" | "labels" | "features" | "train" | "backtest" | "batch" | "publish";
    status: "pending" | "running" | "passed" | "failed" | "skipped";
    gate: {
      passed: boolean | null;
      message: string;
    };
    ms: number | null;
    artifacts: {
      path: string;
      sha256: string;
    }[];
  }[];
  summary: string | null;
}
