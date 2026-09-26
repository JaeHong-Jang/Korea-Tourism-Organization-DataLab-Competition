// KST 자정을 넘는 요청에서 동네지기와 예보관이 같은 시작일 기준을 쓰는지 검증한다
import type { Forecast } from "@crowdcast/contracts/types";
import { expect, it, vi } from "vitest";
import { fakeForecastFetch } from "../src/team/runtime/fake-forecast.js";
import { isClassification } from "./followup-fixture.js";
import { teamFixture, validSequence } from "./team-fixture.js";

// 평시 조회 후 시계가 다음 날이 되어도 요청 시작일로 반환된 예보를 승인한다
it("자정 전 시작한 요청은 두 분석 팀원 모두 전날 기준일을 쓴다", async () => {
  const harness = teamFixture({
    override: async ({ url, body }) => {
      if (url.pathname === "/v1/baseline") {
        expect(url.searchParams.get("before")).toBe("2026-09-25");
        vi.setSystemTime(new Date("2026-09-25T15:00:01Z"));
      }
      if (url.pathname === "/v1/predict") {
        const response = await fakeForecastFetch(url, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const forecast = (await response.json()) as Forecast;
        forecast.asOf = "2026-09-25";
        forecast.predictionRun.asOf = forecast.asOf;
        return Response.json(forecast);
      }
    },
  });
  const id = await harness.prepare();
  vi.setSystemTime(new Date("2026-09-25T14:59:59Z"));
  const events = await harness.message(id);
  validSequence(events);
  expect(
    events.find((event) => event.event === "forecast")?.data,
  ).toMatchObject({ asOf: "2026-09-25" });
  expect(events.at(-1)?.data).toMatchObject({ forecastId: expect.any(String) });
  expect(harness.calls.filter(isClassification)).toHaveLength(0);
});

// 상담 생성 시각이 아닌 각 요청 시작일을 고정해 다음 날 되묻기 답도 새 날짜를 쓴다
it("자정 뒤 시작한 되묻기 답은 새 KST 날짜를 고정한다", async () => {
  const harness = teamFixture();
  const id = await harness.prepare();
  vi.setSystemTime(new Date("2026-09-25T15:00:01Z"));
  const events = await harness.message(id, {
    text: "저장 이유는 나중에, 위험은 확인했어요",
    answer: { hazards: ["폭죽"] },
  });
  validSequence(events);
  expect(
    harness.calls
      .find((call) => call.url.pathname === "/v1/baseline")
      ?.url.searchParams.get("before"),
  ).toBe("2026-09-26");
  expect(
    events.find((event) => event.event === "forecast")?.data,
  ).toMatchObject({ asOf: "2026-09-26" });
  expect(harness.calls.filter(isClassification)).toHaveLength(0);
});
