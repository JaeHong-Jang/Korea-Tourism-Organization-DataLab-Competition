// 관광지 집중률 중계의 쿼리 검사·계약 검증·상류 장애 응답을 확인한다
import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { proxyConfig } from "./proxy-fixture.js";

const summary = {
  sigunguCode: "11680",
  from: "2026-10-01",
  to: "2026-10-02",
  status: "ok",
  fetchedAt: "2026-09-26T01:00:00+00:00",
  windowFrom: "2026-09-25",
  windowTo: "2026-10-24",
  attractions: 2,
  eventMean: 70,
  windowMean: 51.7,
  days: [{ date: "2026-10-01", mean: 60, max: 80 }],
  top: [{ name: "나", rate: 90 }],
  datasetId: "ds-kto-concentration-15128555",
};

afterEach(() => vi.restoreAllMocks());

// 올바른 쿼리는 그대로 넘기고 계약에 맞는 요약만 돌려준다
it("시군구·기간을 넘기고 요약을 돌려준다", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(summary));
  const response = await createApp(proxyConfig, fetcher).request(
    "/api/concentration?sigunguCode=11680&from=2026-10-01&to=2026-10-02",
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(summary);
  expect(String(fetcher.mock.calls[0][0])).toBe(
    `${proxyConfig.services.forecast}/v1/concentration?sigunguCode=11680&from=2026-10-01&to=2026-10-02`,
  );
});

// 잘못된 코드·날짜·뒤집힌 기간은 상류를 부르지 않고 400이다
it.each([
  "sigunguCode=강남&from=2026-10-01&to=2026-10-02",
  "sigunguCode=11680&from=10월&to=2026-10-02",
  "sigunguCode=11680&from=2026-10-03&to=2026-10-01",
  "sigunguCode=11680&from=2026-10-01",
])("잘못된 쿼리 %s", async (query) => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(summary));
  const response = await createApp(proxyConfig, fetcher).request(
    `/api/concentration?${query}`,
  );
  expect(response.status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

// 계약을 어긴 상류 응답과 상류 장애는 값을 지어내지 않고 오류로 돌려준다
it.each([
  [Response.json({ ...summary, status: "sunny" }), 503],
  [new Response("down", { status: 503 }), 503],
])("상류 응답 %#", async (upstream, status) => {
  const fetcher = vi.fn<typeof fetch>(async () => upstream);
  const response = await createApp(proxyConfig, fetcher).request(
    "/api/concentration?sigunguCode=11680&from=2026-10-01&to=2026-10-02",
  );
  expect(response.status).toBe(status);
});
