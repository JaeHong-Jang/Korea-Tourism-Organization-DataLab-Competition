// 조회 경로마다 정상·연결 실패·상류 계약 위반과 5초 마감을 검증한다
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readContractFixture } from "./contract-fixture.js";
import {
  backtest,
  evidence,
  fakeUpstreams,
  festival,
  insight,
  modelCard,
  preregistration,
  proxyConfig,
  report,
  usage,
  weather,
} from "./proxy-fixture.js";

// 고정 경로와 가변 인사이트 키 모두 실제 라우터를 거친다
const queryCases = [
  {
    route: "/api/festivals",
    upstream: "forecast.test/v1/festivals/upcoming",
    body: [festival],
  },
  {
    route: "/api/regions.topojson",
    upstream: "forecast.test/v1/regions/topojson",
    body: { type: "Topology", objects: {}, arcs: [] },
  },
  {
    route: `/api/forecasts/${report.forecastId}`,
    upstream: `records.test/v1/snapshots/${report.forecastId}`,
    body: report,
  },
  {
    route: `/api/evidence/${evidence.id}`,
    upstream: `knowledge.test/v1/evidence/${evidence.id}`,
    body: evidence,
  },
  {
    route: "/api/evidence/stats",
    upstream: "knowledge.test/v1/stats/datalab-usage",
    body: usage,
  },
  {
    route: `/api/weather?${new URLSearchParams({ lat: "37.49", lng: "126.58", at: weather.at })}`,
    upstream: "forecast.test/v1/weather",
    body: weather,
  },
  {
    route: "/api/validation/backtest",
    upstream: "forecast.test/v1/backtest/latest",
    body: backtest,
  },
  {
    route: "/api/validation/preregistration",
    upstream: "forecast.test/v1/preregistration/scores",
    body: preregistration,
  },
  {
    route: "/api/validation/model-card",
    upstream: "forecast.test/v1/model-card/latest",
    body: modelCard,
  },
  ...["I1", "I2", "I3", "I4", "I5", "I6"].map((key) => ({
    route: `/api/insights/${key}`,
    upstream: `forecast.test/v1/insights/${key}`,
    body: { ...insight, key },
  })),
  {
    route: "/api/ops/runs",
    upstream: "forecast.test/v1/runs",
    body: [readContractFixture("pipeline-run/valid-running.json")],
  },
];

// 오류 로그를 관찰하되 예상된 장애가 테스트 출력을 채우지 않게 한다
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 모든 경로에서 계약 위반을 HTTP 성공이나 빈 데이터로 숨기지 않는다
describe.each(queryCases)("$route", ({ route, upstream, body }) => {
  // 원래 JSON 값과 순서를 그대로 반환한다
  it("정상 상류를 지정된 경로에서 읽는다", async () => {
    const fetcher = fakeUpstreams({ [upstream]: body });
    const response = await createApp(proxyConfig, fetcher).request(route);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // 미구현 경로와 장애 상태 모두 같은 게이트웨이 오류로 반환한다
  it.each([404, 503])("상류 HTTP %i이면 503을 준다", async (status) => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response("상류 비공개 원문", { status }),
    );
    const response = await createApp(proxyConfig, fetcher).request(route);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "UPSTREAM_UNAVAILABLE",
      message: expect.any(String),
    });
    expect(console.error).toHaveBeenCalled();
  });

  // 유효한 JSON이라도 미등록 성공 상태와 리다이렉트는 발행하지 않는다
  it.each([201, 206, 301, 302, 307, 308])(
    "상류 HTTP %i를 거부한다",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        Response.json(body, {
          status,
          headers: { location: "http://redirect.test/private" },
        }),
      );
      const response = await createApp(proxyConfig, fetcher).request(route);
      expect(response.status).toBe(503);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
    },
  );

  // 요청마다 독립적인 브라우저 취소 신호가 상류 마감까지 이어진다
  it("연결이 끊기면 5초를 기다리지 않고 상류를 취소한다", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const pending = createApp(proxyConfig, fetcher).request(route, {
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
    controller.abort();
    expect((await pending).status).toBe(503);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  // DNS나 연결 거부도 응답 계약을 갖춘 장애로 처리한다
  it("연결이 없으면 503을 준다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("연결 거부"));
    expect((await createApp(proxyConfig, fetcher).request(route)).status).toBe(
      503,
    );
  });

  // 모든 JSON 계약은 null과 잘못된 JSON 문법을 거부한다
  it.each(["null", "{"])(
    "상류 본문 %s이면 503과 로그를 남긴다",
    async (text) => {
      const fetcher = vi.fn<typeof fetch>(async () => new Response(text));
      const response = await createApp(proxyConfig, fetcher).request(route);
      expect(response.status).toBe(503);
      expect(await response.json()).toHaveProperty(
        "code",
        "UPSTREAM_UNAVAILABLE",
      );
      expect(console.error).toHaveBeenCalled();
    },
  );

  // 취소 신호를 무시하는 fetch도 프록시의 마감 시각에 반환한다
  it("5초에 반환하고 상류 신호를 취소한다", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    let finished = false;
    const pending = Promise.resolve(
      createApp(proxyConfig, fetcher).request(route),
    ).then((response) => {
      finished = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(503);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

// 경계 출처와 캐시는 정상 응답에서만 보존한다
it("경계의 출처·캐시 헤더를 보존한다", async () => {
  const headers = {
    "cache-control": "public, max-age=3600",
    "x-source": "admdongkor ver20251231",
    "x-attribution": "CC BY 4.0",
    "x-data-source-url": "https://example.test/boundary",
    "set-cookie": "internal=private",
  };
  const response = await createApp(proxyConfig, async () =>
    Response.json({ type: "Topology" }, { headers }),
  ).request("/api/regions.topojson");
  for (const key of [
    "cache-control",
    "x-source",
    "x-attribution",
    "x-data-source-url",
  ])
    expect(response.headers.get(key)).toBe(
      headers[key as keyof typeof headers],
    );
  expect(response.headers.get("set-cookie")).toBeNull();
});

// 계약이 아직 정하지 않은 sessionId를 임의로 knowledge에 전달하지 않는다
it("근거 조회는 현재 계약의 경로만 보낸다", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(evidence));
  const response = await createApp(proxyConfig, fetcher).request(
    `/api/evidence/${evidence.id}?sessionId=s-yeongjong`,
  );
  expect(response.status).toBe(200);
  expect(String(fetcher.mock.calls[0][0])).toBe(
    `${proxyConfig.services.knowledge}/v1/evidence/${evidence.id}`,
  );
});
