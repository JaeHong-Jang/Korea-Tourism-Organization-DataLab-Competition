// 실제 상담 라우트에 계약 수치 픽스처와 메모리 서비스만 연결해 가짜 평가를 실행한다

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type {
  Event,
  FestivalSummary,
  Forecast,
  ForecastReport,
  Plan,
  RegionBaseline,
} from "@crowdcast/contracts/types";
import { Hono } from "hono";
import { readConfig } from "../src/config.js";
import type { SessionFacts } from "../src/contract/session-facts.js";
import { createForecastsRoute } from "../src/routes/forecasts.js";
import { createTeamSessionsRoute } from "../src/routes/team-sessions.js";
import { recommendationDates } from "../src/team/recommend/dates.js";
import { evaluationDate } from "./scenario-cases.js";
import { scenarioKnowledge } from "./scenario-fake-knowledge.js";
import type { Scenario } from "./scenario-types.js";

// 수치는 계약 예시를 그대로 쓰며 실제 행사 예측으로 해석하지 않는다
function fixture<T>(name: string): T {
  if (name === "forecast")
    return JSON.parse(
      readFileSync(
        new URL("../fixtures/services/forecast.json", import.meta.url),
        "utf8",
      ),
    );
  const file = name === "region-baseline" ? "valid-28110" : "valid-yeongjong";
  return JSON.parse(
    readFileSync(
      new URL(
        `../../../packages/contracts/fixtures/${name}/${file}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

// 기존 영종 계약 수치를 사례 지역에 대응시키되 식별자와 기준일만 바꾼다
function exampleForecast(
  event: Event,
  id = `f-${event.id.slice(2)}`,
): Forecast {
  const forecast: Forecast = JSON.parse(
    JSON.stringify(fixture<Forecast>("forecast")).replaceAll(
      "f-yeongjong-2025",
      id,
    ),
  );
  const day = new Date(event.startsAt);
  day.setUTCDate(day.getUTCDate() - 14);
  forecast.eventId = event.id;
  forecast.asOf = new Date(day.getTime() + 9 * 3_600_000)
    .toISOString()
    .slice(0, 10);
  forecast.predictionRun.asOf = forecast.asOf;
  return forecast;
}

// 정답 행동을 SSE로 만들어 주지 않고 제품 라우트가 실제 게이트와 후속 저장을 실행하게 한다
export function createScenarioFake(cases: Scenario[]) {
  const knowledge = scenarioKnowledge();
  const reports = new Map<string, ForecastReport>();
  const events = new Map<string, Event>();
  const plans = new Map<string, Plan>();
  const recordings: Record<string, string> = {};
  for (const item of cases) {
    if (item.extraction)
      recordings[item.text] = JSON.stringify(item.extraction);
    if (item.category === "out_of_scope")
      recordings[`classify:${item.text}`] = JSON.stringify({
        intent: "out_of_scope",
      });
  }
  const services: typeof fetch = async (input, init) => {
    init?.signal?.throwIfAborted();
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    // 추천도 정본 festival-summary를 사용하며 날짜만 평가 주말로 이동한다
    if (url.pathname === "/v1/festivals/upcoming") {
      const summary: FestivalSummary = JSON.parse(
        readFileSync(
          new URL(
            "../../../packages/contracts/fixtures/festival-summary/valid-card.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const day = recommendationDates("이번 주말", evaluationDate()).from;
      return Response.json([
        {
          ...summary,
          name: "서울세계불꽃축제",
          type: "불꽃",
          sigunguCode: "11560",
          lat: 37.528,
          lng: 126.934,
          sigunguName: "서울 영등포구",
          startsAt: `${day}T18:00:00+09:00`,
          endsAt: `${day}T21:00:00+09:00`,
        },
      ]);
    }
    if (url.pathname === "/v1/geocode") {
      const location = cases.find(
        (item) =>
          item.extraction?.venueText === body.venueText ||
          (item.category === "recommend" && item.text.includes(body.venueText)),
      )?.location;
      return Response.json({
        candidates: location
          ? [
              {
                sigunguCode: location.code,
                sigunguName: location.name,
                lat: location.lat,
                lng: location.lng,
                score: 1,
              },
            ]
          : [],
      });
    }
    if (url.pathname === "/v1/baseline") {
      const baseline = fixture<RegionBaseline>("region-baseline");
      baseline.sigunguCode =
        url.searchParams.get("sigunguCode") ?? baseline.sigunguCode;
      baseline.sigunguName =
        cases.find((item) => item.location?.code === baseline.sigunguCode)
          ?.location?.name ?? baseline.sigunguName;
      return Response.json(baseline);
    }
    if (url.pathname === "/v1/similar") return Response.json([]);
    if (url.pathname === "/v1/predict")
      return Response.json(exampleForecast(body));
    // 조건만 병합하고 수치는 계약 픽스처 그대로 반환한다
    if (url.pathname === "/v1/whatif")
      return Response.json(
        exampleForecast(
          { ...body.event, ...body.changes },
          `f-whatif-${randomUUID()}`,
        ),
      );
    if (url.pathname === "/v1/events" && body) {
      if (events.has(body.id)) return new Response(null, { status: 409 });
      events.set(body.id, structuredClone(body));
      return Response.json(body);
    }
    if (/^\/v1\/events\/[^/]+$/.test(url.pathname)) {
      const event = events.get(url.pathname.split("/").at(-1) ?? "");
      return event ? Response.json(event) : new Response(null, { status: 404 });
    }
    if (url.pathname.endsWith("/snapshots") && body) {
      reports.set(body.forecastId, structuredClone(body));
      return Response.json(body);
    }
    if (url.pathname.startsWith("/v1/snapshots/")) {
      const report = reports.get(url.pathname.split("/").at(-1) ?? "");
      return report
        ? Response.json(report)
        : new Response(null, { status: 404 });
    }
    if (url.pathname === "/v1/plans" && body) {
      if (plans.has(body.id)) return new Response(null, { status: 409 });
      plans.set(body.id, structuredClone(body));
      return Response.json(body);
    }
    if (url.pathname.startsWith("/v1/plans/")) {
      const plan = plans.get(url.pathname.split("/").at(-1) ?? "");
      return plan ? Response.json(plan) : new Response(null, { status: 404 });
    }
    return (
      knowledge(url, body as SessionFacts | undefined) ??
      new Response(null, { status: 404 })
    );
  };
  const config = readConfig({});
  const app = new Hono();
  app.route(
    "/api/team/sessions",
    createTeamSessionsRoute(config, services, {
      env: { LLM_MODE: "fake", FORECAST_MODE: "live" },
      recordings,
      // 평가 JSON에 스트림을 보존하므로 공용 traces에는 가짜 상담을 쌓지 않는다
      traceAppend: async () => {},
    }),
  );
  app.route("/api/forecasts", createForecastsRoute(config, services));
  return {
    fetcher: ((input, init) =>
      app.request(String(input), init)) as typeof fetch,
  };
}
