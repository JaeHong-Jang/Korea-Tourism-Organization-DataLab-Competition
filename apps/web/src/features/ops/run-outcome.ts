// 실행 기록을 사람이 읽는 결과(새 모델 적용·기존 모델 유지·오류 등)와 백테스트 비교 수치로 풀어낸다.
import type { PipelineRun } from "@crowdcast/contracts/types";
import { stageName } from "./ops-format";

export type OutcomeKind =
  | "running"
  | "passed"
  | "promoted"
  | "kept"
  | "dry"
  | "incomplete"
  | "error";

// 결과 종류별 이름표와 색 단계(ok 파랑·info 파랑·caution 노랑·danger 빨강·neutral 회색).
export const outcomeLabel: Record<OutcomeKind, string> = {
  running: "실행 중",
  passed: "모두 통과",
  promoted: "새 모델 적용",
  kept: "기존 모델 유지",
  dry: "점검 실행",
  incomplete: "개발 중 기록",
  error: "오류",
};
export const outcomeTone: Record<
  OutcomeKind,
  "ok" | "info" | "caution" | "danger" | "neutral"
> = {
  running: "info",
  passed: "ok",
  promoted: "info",
  kept: "caution",
  dry: "neutral",
  incomplete: "neutral",
  error: "danger",
};

// 백테스트 게이트 문구의 새 후보·사용 모델 수치와 허용선(MdAPE +3%p 이하, 포함률 −5%p 이상).
export type GateMetrics = {
  mdape: number;
  mdapeLimit: number;
  coverage: number;
  coverageLimit: number;
};
export function gateMetrics(message: string): GateMetrics | null {
  const match = message.match(
    /MdAPE=([\d.]+)% \(직전 ([\d.]+)% \+3%p\); 포함률=([\d.]+)% \(직전 ([\d.]+)% -5%p\)/,
  );
  if (!match) return null;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    mdape: round(Number(match[1])),
    mdapeLimit: round(Number(match[2]) + 3),
    coverage: round(Number(match[3])),
    coverageLimit: round(Number(match[4]) - 5),
  };
}

// 긴 게이트 문구에서 첫 마디만(세미콜론 앞, 긴 소수는 한 자리) 남긴다.
export function firstClause(message: string): string {
  const head = message.split("; ")[0] ?? message;
  const short = head.replace(/(\d+\.\d)\d{2,}/g, "$1");
  return short.length > 90 ? `${short.slice(0, 88)}…` : short;
}

export type Outcome = {
  kind: OutcomeKind;
  label: string;
  sentence: string;
  metrics: GateMetrics | null;
  verified: boolean;
};

// 실패 단계·백테스트 문구·실행 ID로 결과 종류를 정하고 한 문장 설명을 만든다.
export function runOutcome(run: PipelineRun): Outcome {
  const backtest = run.stages.find((stage) => stage.name === "backtest");
  const metrics = backtest ? gateMetrics(backtest.gate.message) : null;
  const failed = run.stages.find((stage) => stage.status === "failed");
  const promoted = run.stages.some((stage) =>
    stage.gate.message.includes("사용 모델로 승격"),
  );
  const verified = !run.stages.some((stage) =>
    stage.gate.message.includes("미검증"),
  );
  const make = (kind: OutcomeKind, sentence: string): Outcome => ({
    kind,
    label:
      kind === "promoted" && !verified
        ? `${outcomeLabel.promoted} · 미검증`
        : outcomeLabel[kind],
    sentence,
    metrics: kind === "promoted" || kind === "kept" ? metrics : null,
    verified,
  });
  if (run.status === "running") return make("running", "지금 실행하고 있어요.");
  if (run.runId.startsWith("dry-"))
    return make(
      "dry",
      failed
        ? `실제 수집 없이 입력만 점검했어요 — ${stageName[failed.name]}에서 걸림: ${firstClause(failed.gate.message)}`
        : "실제 수집 없이 입력만 점검했어요 — 통과",
    );
  if (
    failed?.name === "backtest" &&
    failed.gate.message.includes("허용 악화폭 초과")
  )
    return make(
      "kept",
      "새로 학습한 후보가 기준에 못 미쳐 쓰지 않았어요 — 지금 모델을 그대로 써요.",
    );
  if (failed)
    return make(
      "error",
      `${stageName[failed.name]}에서 멈췄어요 — ${firstClause(failed.gate.message)}`,
    );
  if (promoted)
    return make(
      "promoted",
      verified
        ? "새 모델로 바꿨어요."
        : "새 모델로 바꿨어요 — 실측 사례 재현은 아직 확인 전(미검증)이에요.",
    );
  if (run.stages.some((stage) => stage.gate.message.startsWith("진입점 없음")))
    return make("incomplete", "그때는 아직 없던 단계가 있어 중간에 멈췄어요.");
  return make(
    run.status === "passed" ? "passed" : "error",
    run.status === "passed"
      ? "고른 단계를 모두 통과했어요."
      : (run.summary ?? "멈춘 이유가 기록되지 않았어요."),
  );
}
