// 시나리오 평가 산출물을 운영 상태 계약의 집계 값으로 바꿔 읽는다
import { readFile } from "node:fs/promises";
import type { OpsStatus } from "@crowdcast/contracts/types";
import { evalSummarySchema } from "./query-schemas.js";

type EvalSummary = NonNullable<OpsStatus["evals"]>;

// 밀리초 지연의 표본 수와 분위수를 계약의 초 단위로 옮긴다
function latencySeconds(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const latency = value as Record<string, unknown>;
  const convert = (item: unknown) => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (!Number.isInteger(row.n) || (row.n as number) < 0) return null;
    if (
      ![row.p50, row.p95].every(
        (part) =>
          part === null ||
          (typeof part === "number" && Number.isFinite(part) && part >= 0),
      )
    )
      return null;
    return {
      n: row.n as number,
      p50: row.p50 === null ? null : (row.p50 as number) / 1000,
      p95: row.p95 === null ? null : (row.p95 as number) / 1000,
    };
  };
  const forecast = convert(latency.forecast);
  const publishedDone = convert(latency.publishedDone);
  return forecast && publishedDone ? { forecast, publishedDone } : null;
}

// 필요한 원본 집계가 빠졌거나 계약에 맞지 않으면 이전 평가로 오인하지 않는다
function evalSummary(value: unknown): EvalSummary | null {
  if (!value || typeof value !== "object") return null;
  const artifact = value as Record<string, unknown>;
  if (!artifact.summary || typeof artifact.summary !== "object") return null;
  const summary = artifact.summary as Record<string, unknown>;
  if (
    (artifact.mode !== "fake" && artifact.mode !== "live") ||
    !Number.isInteger(summary.passed) ||
    !Number.isInteger(summary.total) ||
    (summary.passed as number) < 0 ||
    (summary.passed as number) > (summary.total as number)
  )
    return null;
  const latency = latencySeconds(summary.latency);
  if (!latency || !summary.checks || typeof summary.checks !== "object")
    return null;
  const result: unknown = {
    suite: "scenario",
    runAt: artifact.measuredAt,
    cases: summary.total,
    unsupportedPublished: summary.unlinkedClaims,
    numberMismatch: summary.numberMismatches,
    passed: summary.passed === summary.total,
    checks: summary.checks,
    latencySeconds: latency,
    mode: artifact.mode,
  };
  return evalSummarySchema(result) ? result : null;
}

// 최신 파일이 없거나 모양이 어긋나면 운영 카드에 평가 없음으로 전달한다
export async function readLatestEval(
  path: string | URL = new URL(
    "../../../../reports/evals/latest.json",
    import.meta.url,
  ),
): Promise<EvalSummary | null> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return evalSummary(JSON.parse(contents));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
