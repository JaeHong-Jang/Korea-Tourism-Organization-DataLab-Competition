// 첫 예보·재예보의 스냅샷 비교와 계약·발행 순서를 확인한다
import type { ReforecastResult } from "@crowdcast/contracts/types";
import { expect, it, vi } from "vitest";
import { responseSchema } from "../src/contract/responses.js";
import { reforecastFixture } from "./reforecast-fixture.js";
import { validSequence } from "./team-fixture.js";

// 상담 없이 저장된 행사 그대로 예측하고 두 게이트 뒤에만 스냅샷을 만든다
it("첫 재예보는 before null과 검증된 새 스냅샷을 반환한다", async () => {
  const harness = reforecastFixture();
  const response = await harness.request();
  expect(response.status).toBe(200);
  const result: ReforecastResult = await response.json();
  expect(responseSchema("reforecast-result")(result)).toBe(true);
  expect(result).toMatchObject({
    eventId: harness.event.id,
    forecastId: "f-reforecast-1",
    previousForecastId: null,
    level: { before: null },
    peakConcurrent: { before: null, unit: "명" },
    dailyMean: { before: null, unit: "명/일" },
    weather: { applied: false, evidenceIds: [] },
  });
  expect(result.weather.note).toContain("10일");
  expect(harness.snapshots).toHaveLength(1);
  expect(harness.snapshots[0].event).toEqual(harness.event);
  expect(harness.snapshots[0].sessionId).toMatch(/^s-reforecast-/);
  expect(
    harness.snapshots[0].claims.every(
      (claim) => claim.status === "published" && claim.evidenceIds.length,
    ),
  ).toBe(true);
  expect(harness.llmCalls()).toBe(1);
  const paths = harness.calls.map((call) => call.url.pathname);
  expect(paths.slice(0, 2)).toEqual([
    `/v1/events/${harness.event.id}`,
    `/v1/events/${harness.event.id}/snapshots`,
  ]);
  expect(
    harness.calls.find((call) => call.url.pathname === "/v1/predict")?.body,
  ).toEqual(harness.event);
  expect(paths.some((path) => /geocode|baseline|similar/.test(path))).toBe(
    false,
  );
  const publish = paths.findIndex((path) => path.endsWith("/publish"));
  const save = harness.calls.findIndex(
    (call) =>
      call.method === "POST" && call.url.pathname.endsWith("/snapshots"),
  );
  expect(save).toBeGreaterThan(publish);
  expect(publish).toBeGreaterThan(0);
  expect(
    harness.traces[0].some((event) =>
      ["ask", "event_card"].includes(event.event),
    ),
  ).toBe(false);
  validSequence(harness.traces[0]);
});

// 소수점은 반올림하지 않고 records의 두 불변 예보 값과 정확히 일치해야 한다
it("두 번째 비교는 직전과 새 스냅샷 값을 그대로 보존한다", async () => {
  const harness = reforecastFixture({
    forecast: (forecast, attempt) => {
      forecast.peakConcurrent.p50 = attempt === 1 ? 1800.125 : 2300.875;
      forecast.dailyMean.p50 = attempt === 1 ? 21000.123456 : 24000.654321;
      return forecast;
    },
  });
  expect((await harness.request()).status).toBe(200);
  const first = structuredClone(harness.snapshots[0]);
  vi.setSystemTime(new Date("2026-09-26T03:00:00Z"));
  const response = await harness.request();
  expect(response.status).toBe(200);
  const result: ReforecastResult = await response.json();
  const second = harness.snapshots[1];
  expect(harness.snapshots[0]).toEqual(first);
  expect(first.sessionId).not.toBe(second.sessionId);
  expect(result.previousForecastId).toBe(first.forecastId);
  expect(result.forecastId).toBe(second.forecastId);
  expect(result.publishedAt).toBe(second.publishedAt);
  expect(result.level).toEqual({
    before: first.forecast.judgment.level,
    after: second.forecast.judgment.level,
  });
  for (const key of ["peakConcurrent", "dailyMean"] as const) {
    for (const quantile of ["p10", "p50", "p90"] as const) {
      expect(result[key].before?.[quantile]).toBe(
        first.forecast[key][quantile],
      );
      expect(result[key].after[quantile]).toBe(second.forecast[key][quantile]);
    }
  }
  expect(responseSchema("reforecast-result")(result)).toBe(true);
  for (const trace of harness.traces) validSequence(trace);
});

// records의 반환 순서와 시간대 표기가 달라도 실제 가장 늦은 발행을 선택한다
it("정렬되지 않은 스냅샷 목록에서 발행 시각의 최신 항목을 비교한다", async () => {
  const harness = reforecastFixture();
  expect((await harness.request()).status).toBe(200);
  const older = structuredClone(harness.snapshots[0]);
  older.publishedAt = "2026-09-25T11:00:00+09:00";
  older.forecastId = "f-yeongjong-older";
  older.forecast.id = older.forecastId;
  harness.snapshots.push(older);
  const response = await harness.request();
  expect(response.status).toBe(200);
  expect((await response.json()).previousForecastId).toBe("f-reforecast-1");
});
