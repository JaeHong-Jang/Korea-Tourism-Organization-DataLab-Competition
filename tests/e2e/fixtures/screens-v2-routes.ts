// 화면 캡처에서 모든 API를 계약 견본과 고정 응답으로 대신한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import type { Page } from "@playwright/test";
import { backtest } from "../../../apps/web/src/features/validation/__tests__/validation-fixtures";
import { planFixture } from "./plan-yeongjong";

const root = resolve(process.cwd(), "../../packages/contracts");
const contract = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const event = contract("fixtures/event/valid-yeongjong.json") as Record<
  string,
  unknown
>;
const report = contract(
  "fixtures/forecast-report/valid-yeongjong.json",
) as Record<string, unknown>;
const reforecast = {
  ...(contract(
    "fixtures/reforecast-result/valid-weather-applied.json",
  ) as Record<string, unknown>),
  eventId: event.id,
};
const revised = structuredClone(report);
revised.forecastId = reforecast.forecastId;
revised.publishedAt = reforecast.publishedAt;
const revisedNumbers = revised.forecast as Record<
  string,
  Record<string, number>
>;
revisedNumbers.peakConcurrent.p50 = 18_500;
revisedNumbers.dailyMean.p50 = 46_000;
const consultation = contract(
  "fixtures-sse/valid-new-forecast.json",
) as SseEvent[];
const insightEvidence = contract("fixtures/evidence/valid-data.json") as {
  id: string;
};
const insight = {
  key: "I2",
  title: "인천 중구 평시 방문",
  headline: { value: 14_500, unit: "명/일", text: "방문자 수를 비교했어요." },
  sampleSize: 86,
  comparablePairs: 1,
  period: { from: "2025-01-01", to: "2025-12-31" },
  series: [],
  evidenceIds: [insightEvidence.id],
  evidence: [insightEvidence],
  computedAt: "2026-09-27T12:00:00+09:00",
};

// 비교 상담은 기존 계약 흐름의 행사일과 예보값만 바꿔 두 번째 응답으로 돌려준다.
function changedConsultation(): SseEvent[] {
  const events = structuredClone(consultation);
  for (const item of events) {
    const data = item.data as Record<string, unknown>;
    if (item.event === "event_card") {
      data.startsAt = "2025-10-19T19:00:00+09:00";
      data.endsAt = "2025-10-19T21:00:00+09:00";
    }
    if (item.event === "forecast") {
      data.id = "f-yeongjong-sunday-2025";
      (data.peakConcurrent as Record<string, unknown>).p50 = 30_000;
      (data.dailyMean as Record<string, unknown>).p50 = 16_000;
    }
    if (item.event === "claim") {
      data.forecastId = "f-yeongjong-sunday-2025";
      if (typeof data.rendered === "string")
        data.rendered = data.rendered.replace("21000", "30000");
    }
    if (item.event === "done") data.forecastId = "f-yeongjong-sunday-2025";
  }
  return events;
}

// SSE 순서를 보존해 상담 종료와 what-if의 화면 상태를 재현한다.
function stream(events: SseEvent[]): string {
  return events
    .map((item) => `event: ${item.event}\ndata: ${JSON.stringify(item)}\n\n`)
    .join("");
}

export type CaptureVariant =
  | "normal"
  | "empty"
  | "error"
  | "whatif"
  | "reforecast";

// 먼저 모든 API를 가로채 서버 상태에 관계없이 화면을 고정한다.
export async function routeScreensV2(
  page: Page,
  variant: CaptureVariant = "normal",
) {
  let messages = 0;
  let snapshots = [report];
  const replies: Record<string, unknown> = {
    "/api/forecasts/f-yeongjong-2025": report,
    "/api/forecasts/f-yeongjong-2025/plan": {
      plan: planFixture,
      docxHref: "/api/plans/plan-yeongjong-example/export.docx",
    },
    "/api/plans/plan-yeongjong-example": planFixture,
    "/api/validation/backtest": backtest,
    "/api/validation/model-card": contract(
      "fixtures/model-card/valid-v0-1-0.json",
    ),
    "/api/evidence/stats": contract(
      "fixtures/datalab-usage/valid-example.json",
    ),
    "/api/insights/datalab-spec": contract(
      "fixtures/datalab-spec/valid-example.json",
    ),
    "/api/insights/I2": insight,
    "/api/ops/runs": [contract("fixtures/pipeline-run/valid-running.json")],
    "/api/ops/status": contract("fixtures/ops-status/valid-example.json"),
    "/api/records/events": variant === "empty" ? [] : [event],
    "/api/records/shares/sh-yeongjong2025abcd": report,
    "/api/team/sessions": { sessionId: "s-screens-v2" },
    "/api/team/sessions/s-screens-v2/steps": [],
  };

  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/weather") {
      const at = url.searchParams.get("at") ?? "2026-10-18T03:00:00.000Z";
      return route.fulfill({
        json: {
          lat: Number(url.searchParams.get("lat")),
          lng: Number(url.searchParams.get("lng")),
          at,
          sky: "맑음",
          pty: "없음",
          temp: 18,
          pop: 10,
          source: "단기예보",
          fetchedAt: at,
        },
      });
    }
    if (path === "/api/team/sessions/s-screens-v2/messages") {
      messages += 1;
      return route.fulfill({
        contentType: "text/event-stream",
        body: stream(messages === 1 ? consultation : changedConsultation()),
      });
    }
    if (path === `/api/events/${event.id}/reforecast`) {
      snapshots = [revised, report];
      return route.fulfill({ json: reforecast });
    }
    if (path === `/api/records/events/${event.id}/snapshots`)
      return route.fulfill({ json: snapshots });
    if (path === "/api/records/shares")
      return route.fulfill({ json: { token: "sh-yeongjong2025abcd" } });
    if (variant === "error" && path === "/api/ops/runs")
      return route.fulfill({ status: 503, json: {} });
    if (path in replies) return route.fulfill({ json: replies[path] });
    return route.fulfill({ status: 503, json: {} });
  });
}

export const consultExample =
  "10월 18일 19시부터 21시까지 영종 씨사이드파크에서 인천 중구가 여는 불꽃축제를 해요";
