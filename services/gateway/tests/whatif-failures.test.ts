// 새 예보와 날씨 답변의 실패가 기존 발행본을 훼손하거나 검증을 우회하지 않는지 검사한다

import type { Forecast, ForecastCard } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { eventData } from "../evals/scenario-score.js";
import { fakeForecastFetch } from "../src/team/runtime/fake-forecast.js";
import {
  claimsIn,
  isClassification,
  validFollowup,
} from "./followup-fixture.js";
import { failedGate } from "./reforecast-fixture.js";
import { isReplyCall } from "./reply-fixture.js";
import { oodForecast } from "./report-fixture.js";
import { validSequence } from "./team-fixture.js";
import { whatifFixture, withWeatherAssumption } from "./whatif-fixture.js";

// 어느 게이트가 실패하든 새 문장·스냅샷을 발행하지 않고 이전 예보로 후속을 재개한다
it.each(["A", "B"] as const)(
  "게이트 %s 실패는 이전 예보를 보존한다",
  async (gate) => {
    let reject = true;
    const harness = whatifFixture({
      override: async ({ url }) => {
        if (
          reject &&
          url.pathname.includes("/s-whatif-") &&
          url.pathname.endsWith("/validate") &&
          url.searchParams.get("shapes")?.includes(gate === "A" ? "S03" : "S01")
        )
          return failedGate(url, gate);
      },
    });
    const { id, forecastId, report } = await harness.publish();
    const before = harness.calls.filter((call) => !isReplyCall(call)).length;
    const events = await harness.message(id, { text: "유료면?" });
    validSequence(events);
    expect(claimsIn(events)).toHaveLength(0);
    expect(eventData(events, "error")).toHaveLength(1);
    expect(harness.snapshots.size).toBe(1);
    expect(harness.snapshots.get(forecastId)).toEqual(report);
    expect(events.at(-1)?.data).toMatchObject({ forecastId: null });
    expect(
      harness.calls
        .filter((call) => !isReplyCall(call))
        .slice(before)
        .filter((call) => call.url.pathname === "/api/chat").length,
    ).toBeLessThanOrEqual(2);
    const restored = await harness.message(id, { text: "왜 이렇게 많아?" });
    validFollowup(restored, forecastId);
    expect(claimsIn(restored).length).toBeGreaterThan(0);
    reject = false;
    const retry = await harness.message(id, { text: "유료면?" });
    validSequence(retry);
    expect(claimsIn(retry).length).toBeGreaterThan(0);
  },
);

// 잘못된 상류 식별자·기준일은 그래프 적재와 숫자 카드 이전에 거부한다
it.each(["id", "asOf", "eventId"])(
  "what-if 상류 %s 불일치를 거부한다",
  async (field) => {
    let original: Forecast;
    const harness = whatifFixture({
      override: async ({ url, body }) => {
        if (url.pathname !== "/v1/whatif") return;
        const response = await fakeForecastFetch(url, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const forecast = (await response.json()) as Forecast;
        if (field === "id") return Response.json(original);
        if (field === "asOf") forecast.asOf = "2025-01-01";
        else forecast.eventId = "e-busan-fireworks-2026";
        return Response.json(forecast);
      },
    });
    const { id, report, forecastId } = await harness.publish();
    original = report.forecast;
    const events = await harness.message(id, { text: "유료면?" });
    validSequence(events);
    expect(eventData(events, "forecast")).toHaveLength(0);
    expect(eventData(events, "gate")).toHaveLength(0);
    expect(eventData(events, "error")).toHaveLength(1);
    expect(harness.snapshots.get(forecastId)).toEqual(report);
  },
);

// 연속 조건 변경은 방금 발행한 행사 조건에서 시작하고 앞선 스냅샷도 남긴다
it("연속 변경은 최신 발행본에 누적한다", async () => {
  const harness = whatifFixture();
  const { id, forecastId } = await harness.publish();
  const first = await harness.message(id, { text: "유료면?" });
  const card = eventData<ForecastCard>(first, "forecast")[0];
  const second = await harness.message(id, { text: "낮이면?" });
  validSequence(second);
  const next = eventData<ForecastCard>(second, "forecast")[0];
  expect(next.id).not.toBe(card.id);
  expect(harness.snapshots.get(next.id)?.event).toMatchObject({
    fee: "유료",
    timeOfDay: "주간",
  });
  expect(harness.snapshots.has(forecastId)).toBe(true);
  expect(harness.snapshots.has(card.id)).toBe(true);
  expect(
    harness.calls
      .filter((call) => !isReplyCall(call))
      .filter((call) => call.url.pathname === "/v1/whatif")
      .at(-1)?.body,
  ).toMatchObject({ event: { fee: "유료" }, changes: { timeOfDay: "주간" } });
});

// 분류 한 번과 해설·재작성 두 번을 합한 최악 경로도 상한을 지킨다
it("모호한 분류와 게이트 B 재작성은 LLM 세 번 안에 발행한다", async () => {
  let failed = false;
  const harness = whatifFixture({
    override: async (call) => {
      if (isClassification(call))
        return Response.json({
          message: {
            role: "assistant",
            content: JSON.stringify({ intent: "whatif", whatifKind: "type" }),
          },
          done: true,
          done_reason: "stop",
        });
      if (
        !failed &&
        call.url.pathname.includes("/s-whatif-") &&
        call.url.pathname.endsWith("/validate") &&
        call.url.searchParams.get("shapes")?.includes("S01")
      ) {
        failed = true;
        return failedGate(call.url, "B");
      }
    },
  });
  const { id } = await harness.publish();
  const before = harness.calls.filter((call) => !isReplyCall(call)).length;
  const events = await harness.message(id, { text: "전통 행사로 해 보면?" });
  validSequence(events);
  expect(claimsIn(events).length).toBeGreaterThan(0);
  expect(
    harness.calls
      .filter((call) => !isReplyCall(call))
      .slice(before)
      .filter((call) => call.url.pathname === "/api/chat"),
  ).toHaveLength(3);
});

// 현재 계약이 거부하는 누락 가정은 숫자를 만들어 보충하지 않고 안내한다
it("날씨 가정이 없는 기존 예보는 명시적으로 발행을 보류한다", async () => {
  const harness = whatifFixture();
  const { id, forecastId } = await harness.publish();
  const before = harness.calls.filter((call) => !isReplyCall(call)).length;
  const events = await harness.message(id, { text: "비 오면?" });
  validFollowup(events, forecastId);
  expect(claimsIn(events)).toHaveLength(0);
  expect(eventData(events, "error")).toMatchObject([
    {
      code: "OUT_OF_SCOPE",
      message: expect.stringContaining("이 예보에는 날씨 근거가 없어요"),
    },
  ]);
  expect(
    harness.calls.filter((call) => !isReplyCall(call)).slice(before),
  ).toHaveLength(0);
});

// 반복 날씨 답변도 후보 정리를 유지하고 OOD 권고에는 참고용 근거를 붙인다
it("OOD 예보의 눈·비 질문은 같은 그래프에서 반복 발행한다", async () => {
  const harness = whatifFixture({
    forecast: (forecast) => oodForecast(withWeatherAssumption(forecast)),
  });
  const { id, forecastId } = await harness.publish();
  for (const text of ["눈 오면?", "비 오면?"]) {
    const events = await harness.message(id, { text });
    validFollowup(events, forecastId);
    expect(eventData(events, "error")).toHaveLength(0);
    expect(claimsIn(events)).toHaveLength(2);
  }
});
