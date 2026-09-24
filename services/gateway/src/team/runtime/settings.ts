// 팀 실행 설정을 읽고 가짜 예측과 실제 서비스 연결을 명시적으로 선택한다
import { fileURLToPath } from "node:url";
import type { GatewayConfig } from "../../config.js";
import { appendTrace, type TraceAppend } from "./trace.js";

export type TeamOptions = {
  env?: NodeJS.ProcessEnv;
  traceDirectory?: string;
  deadlineMs?: number;
  recordings?: Readonly<Record<string, string>>;
  traceAppend?: TraceAppend;
};

// 기록과 재생은 같은 경로 선택 함수를 사용해 실행 위치와 무관하게 파일을 찾는다
export function teamTraceDirectory(
  options: Pick<TeamOptions, "traceDirectory"> = {},
) {
  return (
    options.traceDirectory ??
    fileURLToPath(new URL("../../../../../traces/", import.meta.url))
  );
}

// 앱 설정 파일 수정 없이 task 범위 안에서 런타임 전용 설정을 제공한다
export function teamSettings(
  config: GatewayConfig,
  fetcher: typeof fetch,
  options: TeamOptions = {},
) {
  const env = options.env ?? process.env;
  const mode = env.FORECAST_MODE ?? "live";
  if (!["fake", "live"].includes(mode))
    throw new Error("FORECAST_MODE는 fake 또는 live여야 합니다");
  if (mode === "fake")
    console.warn(
      "FORECAST_MODE=fake: 영종 씨사이드파크 불꽃 계약 예시 수치만 재생합니다. 실제 예보가 아닙니다.",
    );
  const deadlineMs = options.deadlineMs ?? 20_000;
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0)
    throw new Error("요청 마감은 양수여야 합니다");
  return {
    config,
    fetcher,
    env,
    mode,
    deadlineMs,
    recordings: options.recordings,
    traceAppend: options.traceAppend ?? appendTrace,
    traceDirectory: teamTraceDirectory(options),
  };
}

export type TeamSettings = ReturnType<typeof teamSettings>;
