// 재예보 라우트를 실제 계약·가짜 knowledge·메모리 records·가짜 Ollama로 실행한다
import type {
  Event,
  Forecast,
  ForecastReport,
  GateReport,
  SseEvent,
} from "@crowdcast/contracts/types";
import { Hono } from "hono";
import { afterEach, vi } from "vitest";
import type { SessionFacts } from "../src/contract/session-facts.js";
import { createEventsRoute } from "../src/routes/events.js";
import { templateTexts } from "../src/team/report/templates.js";
import { fakeForecastFetch } from "../src/team/runtime/fake-forecast.js";
import { knowledgeFixture } from "./knowledge-fixture.js";
import { proxyConfig, report } from "./proxy-fixture.js";

export type ReforecastCall = {
  url: URL;
  method: string;
  body: unknown;
  signal?: AbortSignal | null;
};
type Options = {
  override?: (call: ReforecastCall) => Promise<Response | undefined>;
  forecast?: (forecast: Forecast, attempt: number) => Forecast;
  deadlineMs?: number;
};

// 고정 시각과 오류 로그 모킹은 테스트 사이에 남기지 않는다
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 서비스 저장소는 복제본을 반환해 이전 스냅샷의 변경까지 확인할 수 있게 한다
export function reforecastFixture(options: Options = {}) {
  vi.setSystemTime(new Date("2026-09-25T03:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const event: Event = {
    ...structuredClone(report.event),
    id: "e-yeongjong-fireworks-2026",
    startsAt: "2026-10-18T19:00:00+09:00",
    endsAt: "2026-10-18T21:00:00+09:00",
  };
  const snapshots: ForecastReport[] = [];
  const calls: ReforecastCall[] = [];
  const traces: SseEvent[][] = [];
  const traceFiles = new Map<string, number>();
  const knowledge = knowledgeFixture();
  let predictions = 0;
  let forecast: Forecast;
  let llmCalls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call = {
      url,
      body,
      method: init?.method ?? "GET",
      signal: init?.signal,
    };
    calls.push(call);
    const overridden = await options.override?.(call);
    if (overridden) return overridden;

    // 기록 조회와 저장은 전용 호스트에서만 처리하고 행사 덮어쓰기는 허용하지 않는다
    if (url.host === "records.test") {
      if (url.pathname === `/v1/events/${event.id}` && call.method === "GET")
        return Response.json(event);
      if (url.pathname === `/v1/events/${event.id}/snapshots`) {
        if (call.method === "GET") return Response.json(snapshots);
        snapshots.push(structuredClone(body));
        return Response.json(body);
      }
      throw new Error("예상하지 않은 records 요청");
    }

    // 평시·유사 행사는 상담과 같은 가짜 forecast 응답을 쓴다(재예보도 먼저 적재한다)
    if (url.pathname === "/v1/baseline" || url.pathname === "/v1/similar")
      return fakeForecastFetch(input, init);

    // 예보마다 식별자만 새로 부여하고 테스트가 지정한 수치를 그대로 반환한다
    if (url.pathname === "/v1/predict") {
      const response = await fakeForecastFetch(input, init);
      const value = await response.json();
      forecast = JSON.parse(
        JSON.stringify(value).replaceAll(
          value.id,
          `f-reforecast-${++predictions}`,
        ),
      );
      forecast = options.forecast?.(forecast, predictions) ?? forecast;
      return Response.json(forecast);
    }

    // 실제 Ollama 클라이언트의 JSON 생성 요청을 받아 해설 요인만 반환한다
    if (url.pathname === "/api/chat") {
      llmCalls++;
      return Response.json({
        message: {
          role: "assistant",
          content: JSON.stringify({
            claims: templateTexts(forecast)
              .filter((claim) => claim.claimType === "요인")
              .slice(0, 3),
          }),
        },
        done: true,
        done_reason: "stop",
        load_duration: 0,
        eval_count: 120,
      });
    }
    const response = knowledge(url, body as SessionFacts | undefined);
    if (response) return response;
    throw new Error(`예상하지 않은 상류: ${url.pathname}`);
  };
  const app = new Hono().route(
    "/api/events",
    createEventsRoute(proxyConfig, fetcher, {
      env: { FORECAST_MODE: "live", LLM_MODE: "ollama" },
      deadlineMs: options.deadlineMs,
      // 공유 산출물을 만들지 않고 같은 직렬 trace 봉투를 메모리에서 검증한다
      traceAppend: async (path, line) => {
        if (!traceFiles.has(path)) {
          traceFiles.set(path, traces.length);
          traces.push([]);
        }
        traces[traceFiles.get(path) ?? 0].push(JSON.parse(line));
      },
    }),
  );
  return {
    app,
    event,
    snapshots,
    calls,
    traces,
    llmCalls: () => llmCalls,
    request: (signal?: AbortSignal) =>
      app.request(`/api/events/${event.id}/reforecast`, {
        method: "POST",
        signal,
      }),
  };
}

// 실제 요청의 검증 범위를 유지하며 원하는 게이트만 거부한다
export function failedGate(url: URL, gate: GateReport["gate"]): Response {
  return Response.json({
    gate,
    passed: false,
    revision: Number(url.searchParams.get("revision")),
    masterVersion: 7,
    violations: [
      {
        check: "shacl",
        shapeId: gate === "A" ? "S09" : "S11",
        nodeId: "c-yeongjong",
        message: "검증 근거 불일치",
      },
    ],
  });
}
