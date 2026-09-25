// 실제 서비스 상담의 SSE 순서·시간과 Ollama 연결 차단 대체 경로를 측정한다
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
// @ts-expect-error 계약 순서 검사는 JavaScript로 배포된다
import { sequenceProblems } from "@crowdcast/contracts/rules/sse-sequence.mjs";
import type { AgentStep, SseEvent } from "@crowdcast/contracts/types";
import { Hono } from "hono";
import { readConfig } from "../src/config.js";
import { createLlmClient } from "../src/llm/ollama-client.js";
import { createTeamSessionsRoute } from "../src/routes/team-sessions.js";

// 키가 포함된 환경 전체를 출력하지 않고 연결·생성 결과만 기록한다
const env = {
  ...parseEnv(readFileSync(new URL("../../../.env", import.meta.url), "utf8")),
  ...process.env,
  FORECAST_MODE: "live",
  LLM_MODE: "ollama",
};
const config = readConfig(env);
const directory = mkdtempSync(join(tmpdir(), "crowdcast-t304-manual-"));
const answer = {
  name: "영종 불꽃축제",
  type: "불꽃",
  startsAt: "2026-10-18T19:00:00+09:00",
  endsAt: "2026-10-18T21:00:00+09:00",
  timeOfDay: "야간",
  venueText: "인천 중구 영종 씨사이드파크",
  fee: "무료",
  hostType: "지자체",
  budgetKrw: 200000000,
  hazards: ["폭죽"],
};
const text =
  "2026년 10월 18일 19~21시 인천 중구 영종 씨사이드파크에서 영종 불꽃축제를 열어요. 무료이고 주최는 인천 중구청입니다. 예산 2억원, 폭죽을 사용해요.";

// 연결 가능한 서비스만 사용하며 다른 레인의 서버를 기동하지 않는다
const health = await Promise.all(
  Object.entries(config.services).map(async ([name, base]) => {
    try {
      const response = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      return { service: name, status: response.status };
    } catch {
      return { service: name, status: "unavailable" };
    }
  }),
);

// 지명 사전의 첫 빌드 시간을 상담 마감과 분리하고 실제 로딩은 명시한 실행에서만 측정한다
const warmup = await fetch(`${config.services.forecast}/v1/geocode`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ venueText: answer.venueText }),
  signal: AbortSignal.timeout(30_000),
})
  .then((response) => response.status)
  .catch(() => "unavailable");
const cold = process.argv.includes("--cold");
if (cold) await createLlmClient({ env }).unload();

// 실제 스트림 청크를 읽은 시각으로 숫자 카드·발행 소요 시간을 계산한다
async function request(app: Hono, sessionId: string, body: object) {
  const start = performance.now();
  const response = await app.request(
    `/api/team/sessions/${sessionId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const events: SseEvent[] = [];
  const timing: Record<string, number> = {};
  const reader = response.body?.getReader();
  if (!reader) throw new Error("SSE 응답 없음");
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    pending += decoder.decode(chunk.value, { stream: true });
    let end = pending.indexOf("\n\n");
    while (end >= 0) {
      const frame = pending.slice(0, end);
      pending = pending.slice(end + 2);
      const line = frame.split("\n").find((line) => line.startsWith("data: "));
      if (line) {
        const event = JSON.parse(line.slice(6)) as SseEvent;
        events.push(event);
        timing[event.event] ??= Math.round(performance.now() - start);
      }
      end = pending.indexOf("\n\n");
    }
  }
  return {
    events,
    timing,
    problems: sequenceProblems(events),
    elapsedMs: Math.round(performance.now() - start),
  };
}

// 공용 Ollama 프로세스를 내리지 않고 이 요청에서만 연결 불가를 재현한다
async function consult(offline: boolean) {
  const calls: {
    path: string;
    ms: number;
    loadMs?: number;
    error?: string;
    status?: number;
    explanation?: boolean;
    inputChars?: number;
  }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const start = performance.now();
    if (offline && path === "/api/chat") {
      calls.push({ path, ms: 0, error: "offline" });
      throw new TypeError("Ollama 연결 차단");
    }
    try {
      const response = await fetch(input, init);
      const row: (typeof calls)[number] = {
        path,
        ms: Math.round(performance.now() - start),
        status: response.status,
      };
      if (path === "/api/chat") {
        const request = JSON.parse(String(init?.body));
        const content = request.messages[1].content as string;
        row.explanation =
          request.format?.$id?.includes("explanation-output") ?? false;
        row.inputChars = content.length;
        if (response.ok)
          row.loadMs = (await response.clone().json()).load_duration / 1e6;
      }
      calls.push(row);
      return response;
    } catch (error) {
      calls.push({
        path,
        ms: Math.round(performance.now() - start),
        error: "unavailable",
      });
      throw error;
    }
  };
  const app = new Hono().route(
    "/api/team/sessions",
    createTeamSessionsRoute(config, fetcher, {
      env,
      traceDirectory: directory,
    }),
  );
  const created = await app.request("/api/team/sessions", { method: "POST" });
  const { sessionId } = await created.json();
  const requests = [await request(app, sessionId, { text })];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!requests.at(-1)?.events.some((event) => event.event === "ask")) break;
    requests.push(
      await request(app, sessionId, { text: "행사 정보 확인", answer }),
    );
  }
  return { offline, sessionId, calls, requests };
}

// 첫 측정·이미 로딩·연결 차단 상담을 기록하고 화면에는 계측 요약만 출력한다
const runs = [await consult(false), await consult(false), await consult(true)];
const output = join(directory, "result.json");
writeFileSync(
  output,
  JSON.stringify(
    { at: new Date().toISOString(), health, warmup, cold, runs },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      health,
      warmup,
      cold,
      output,
      runs: runs.map((run, index) => ({
        mode: [cold ? "cold" : "online-first", "warm", "offline"][index],
        offline: run.offline,
        calls: run.calls,
        requests: run.requests.map((item) => ({
          timing: item.timing,
          problems: item.problems,
          elapsedMs: item.elapsedMs,
          claims: item.events.filter((event) => event.event === "claim").length,
          explainer: item.events
            .filter(
              (event) =>
                event.event === "agent_step" &&
                (event.data as AgentStep).agentId === "explainer",
            )
            .map((event) => event.data),
          gates: item.events
            .filter((event) => event.event === "gate")
            .map((event) => event.data),
          ending: item.events.slice(-2),
        })),
      })),
    },
    null,
    2,
  ),
);
