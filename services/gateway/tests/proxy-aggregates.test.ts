// 여러 상류 응답을 합치는 명세·운영 조회의 부분 결측과 장애를 검증한다
import { Hono } from "hono";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { opsStatusSchema } from "../src/clients/query-schemas.js";
import { createOpsRoute } from "../src/routes/ops.js";
import {
  fakeUpstreams,
  modelCard,
  ops,
  proxyConfig,
  spec,
  usage,
} from "./proxy-fixture.js";

// 테스트마다 실제 평가 파일을 읽지 않고 조회 결과를 주입한다
const opsBodies = {
  "forecast.test/v1/ops/freshness": ops.freshness,
  "forecast.test/v1/model-card/latest": modelCard,
  "knowledge.test/v1/stats/graph": ops.graph,
};
const specBodies = {
  "forecast.test/v1/datalab/spec": spec,
  "knowledge.test/v1/stats/datalab-usage": usage,
};

// 예상된 장애 로그와 테스트 시계를 복원한다
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 생성 시각만 게이트웨이가 만들고 나머지 값은 검증된 원문에서 가져온다
it("운영 상태를 모델 카드·최신성·그래프·평가로 조립한다", async () => {
  const fetcher = fakeUpstreams(opsBodies);
  const route = createOpsRoute(
    proxyConfig,
    fetcher,
    async () => ops.evals,
    async () => "미검증",
  );
  const response = await route.request("/status");
  const result = await response.json();
  expect(response.status).toBe(200);
  expect(opsStatusSchema(result)).toBe(true);
  expect(result).toEqual({
    generatedAt: expect.any(String),
    freshness: ops.freshness,
    graph: ops.graph,
    evals: ops.evals,
    model: {
      modelRunId: modelCard.id,
      modelVersion: modelCard.modelVersion,
      trainRange: modelCard.trainRange,
      createdAt: modelCard.createdAt,
      verdict: "미검증",
    },
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

// 계약에서 허용한 부분 결측은 영이나 임의 값으로 채우지 않는다
it("평가 파일 없음과 최신성의 null을 보존한다", async () => {
  const freshness = [
    {
      ...ops.freshness[0],
      lastCollectedAt: null,
      lastObservedDate: null,
      rows: null,
    },
  ];
  const route = createOpsRoute(
    proxyConfig,
    fakeUpstreams({
      ...opsBodies,
      "forecast.test/v1/ops/freshness": freshness,
    }),
    async () => null,
  );
  const app = new Hono().route("/api/ops", route);
  const response = await app.request("/api/ops/status");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ freshness, evals: null });
});

// 각 필수 상류가 없거나 계약을 어기면 다른 부분이 정상이어도 실패한다
it.each(
  Object.keys(opsBodies).flatMap((key) =>
    ["offline", "invalid", "404", "503"].map((mode) => ({ key, mode })),
  ),
)("운영 상류 $key $mode", async ({ key, mode }) => {
  const baseFetch = fakeUpstreams(opsBodies);
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith(key.split(".test")[1])) {
      if (mode === "offline") throw new TypeError("연결 거부");
      return mode === "invalid"
        ? Response.json(null)
        : new Response(null, { status: Number(mode) });
    }
    return baseFetch(input, init);
  };
  const response = await createOpsRoute(
    proxyConfig,
    fetcher,
    async () => null,
  ).request("/status");
  expect(response.status).toBe(503);
  expect(console.error).toHaveBeenCalled();
});

// 파일 읽기 오류나 검증하지 못한 평가는 운영 성공으로 발행하지 않는다
it("평가 조회 실패를 503으로 반환한다", async () => {
  const response = await createOpsRoute(
    proxyConfig,
    fakeUpstreams(opsBodies),
    async () => {
      throw new Error("평가 파일 오류");
    },
  ).request("/status");
  expect(response.status).toBe(503);
});

// 통계가 없는 행은 null이고 명시된 영은 영으로 보존한다
it("명세에 datasetId가 같은 근거 수만 연결한다", async () => {
  const rows = [
    spec.rows[0],
    { ...spec.rows[0], datasetId: "ds-kto-tourapi", evidenceCount: 999 },
  ];
  const evidenceByDataset = [
    {
      ...usage.evidenceByDataset[0],
      datasetId: spec.rows[0].datasetId,
      count: 0,
    },
  ];
  const fetcher = fakeUpstreams({
    "forecast.test/v1/datalab/spec": { ...spec, rows },
    "knowledge.test/v1/stats/datalab-usage": { ...usage, evidenceByDataset },
  });
  const response = await createApp(proxyConfig, fetcher).request(
    "/api/insights/datalab-spec",
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ...spec,
    rows: [
      { ...rows[0], evidenceCount: 0 },
      { ...rows[1], evidenceCount: null },
    ],
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

// 어느 상류의 계약 위반도 병합 과정에서 사라지면 안 된다
it.each(
  Object.keys(specBodies).flatMap((key) =>
    ["offline", "invalid", "404", "503"].map((mode) => ({ key, mode })),
  ),
)("명세 상류 $key $mode", async ({ key, mode }) => {
  const baseFetch = fakeUpstreams(specBodies);
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith(key.split(".test")[1])) {
      if (mode === "offline") throw new TypeError("연결 거부");
      return mode === "invalid"
        ? Response.json(null)
        : new Response(null, { status: Number(mode) });
    }
    return baseFetch(input, init);
  };
  const response = await createApp(proxyConfig, fetcher).request(
    "/api/insights/datalab-spec",
  );
  expect(response.status).toBe(503);
  expect(console.error).toHaveBeenCalled();
});

// 병렬 상류 요청의 마감은 합산 시간이 아니라 각각 5초다
it.each(["ops", "spec"])("%s 병렬 요청은 5초에 끝난다", async (kind) => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const pending =
    kind === "ops"
      ? createOpsRoute(proxyConfig, fetcher, async () => null).request(
          "/status",
        )
      : createApp(proxyConfig, fetcher).request("/api/insights/datalab-spec");
  await vi.advanceTimersByTimeAsync(5_000);
  expect((await pending).status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(kind === "ops" ? 3 : 2);
  expect(fetcher.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(
    true,
  );
  expect(vi.getTimerCount()).toBe(0);
});

// 병렬 조회는 한 브라우저 요청의 취소에 모두 중단된다
it.each(["ops", "spec"])(
  "%s 연결이 끊기면 병렬 상류를 전부 취소한다",
  async (kind) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const pending =
      kind === "ops"
        ? createOpsRoute(proxyConfig, fetcher, async () => null).request(
            "/status",
            { signal: controller.signal },
          )
        : createApp(proxyConfig, fetcher).request(
            "/api/insights/datalab-spec",
            { signal: controller.signal },
          );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(kind === "ops" ? 3 : 2);
    controller.abort();
    expect((await pending).status).toBe(503);
    expect(fetcher.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
  },
);

// 필수 상류 실패와 사용자 취소를 구분해 나머지 조회를 다룬다
it("운영 상류 하나가 실패해도 다른 상류는 연결 종료 시에 취소한다", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>((input) =>
    String(input).endsWith("/freshness")
      ? Promise.reject(new Error("상류 연결 실패"))
      : new Promise(() => {}),
  );
  const response = await createOpsRoute(
    proxyConfig,
    fetcher,
    async () => null,
  ).request("/status", { signal: controller.signal });
  expect(response.status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(
    fetcher.mock.calls.every(([, init]) => init?.signal?.aborted === false),
  ).toBe(true);
  controller.abort();
  await vi.advanceTimersByTimeAsync(0);
  expect(
    fetcher.mock.calls.slice(1).every(([, init]) => init?.signal?.aborted),
  ).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
