// 행사 부재·상류 장애·잘못된 스냅샷과 동시 실행 잠금을 검사한다
import { expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { proxyConfig } from "./proxy-fixture.js";
import { reforecastFixture } from "./reforecast-fixture.js";

// 행사 자체의 404만 부재로 전달하고 이후 상류 404는 장애로 취급한다
it.each(["event", "snapshots", "predict", "validate", "publish", "save"])(
  "%s 상류 실패를 올바른 상태로 돌려준다",
  async (stage) => {
    const harness = reforecastFixture({
      override: async ({ url, method }) => {
        if (
          (stage === "event" && /\/events\/e-[^/]+$/.test(url.pathname)) ||
          (stage === "snapshots" &&
            url.pathname.endsWith("/snapshots") &&
            method === "GET")
        )
          return new Response(null, { status: 404 });
        if (
          url.pathname.endsWith(`/${stage}`) ||
          (stage === "save" &&
            url.pathname.endsWith("/snapshots") &&
            method === "POST")
        )
          return new Response(null, { status: 503 });
      },
    });
    const response = await harness.request();
    expect(response.status).toBe(stage === "event" ? 404 : 503);
    expect((await response.json()).code).toBe(
      stage === "event" ? "event_not_found" : "UPSTREAM_UNAVAILABLE",
    );
    expect(harness.snapshots).toEqual([]);
    if (stage !== "save" && stage !== "publish")
      expect(
        harness.calls.some((call) => call.url.pathname.endsWith("/publish")),
      ).toBe(false);
  },
);

// 앱의 최상위 경로 연결도 실제 라우트까지 도달하는지 확인한다
it("createApp에 재예보 경로가 등록돼 있다", async () => {
  const app = createApp(
    proxyConfig,
    async () => new Response(null, { status: 404 }),
  );
  const response = await app.request(
    "/api/events/e-yeongjong-2026/reforecast",
    { method: "POST" },
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "event_not_found" });
});

// 첫 읽기부터 잠금을 잡아 중복 요청은 상류를 호출하지 않고 종료한다
it("같은 행사 동시 요청은 409이고 완료 뒤 잠금을 해제한다", async () => {
  let release = () => {};
  let started = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let held = false;
  const harness = reforecastFixture({
    override: async ({ url }) => {
      if (!held && /\/events\/e-[^/]+$/.test(url.pathname)) {
        held = true;
        started();
        await blocked;
      }
      return undefined;
    },
  });
  const first = harness.request();
  await entered;
  const second = await harness.request();
  expect(second.status).toBe(409);
  expect(await second.json()).toMatchObject({ code: "reforecast_in_progress" });
  expect(harness.calls).toHaveLength(1);
  release();
  expect((await first).status).toBe(200);
  expect((await harness.request()).status).toBe(200);
  expect(harness.snapshots).toHaveLength(2);
});

// 실패한 호출의 잠금은 다음 요청을 영구적으로 막지 않는다
it("서비스 실패 뒤에도 같은 행사를 재시도할 수 있다", async () => {
  let failed = false;
  const harness = reforecastFixture({
    override: async () => {
      if (!failed) {
        failed = true;
        return new Response(null, { status: 503 });
      }
    },
  });
  expect((await harness.request()).status).toBe(503);
  expect((await harness.request()).status).toBe(200);
});

// 요청이 취소되면 지연된 읽기 뒤의 예측·쓰기 호출을 시작하지 않는다
it("연결 취소는 작업을 중단하고 잠금을 해제한다", async () => {
  let release = () => {};
  let started = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let held = false;
  const harness = reforecastFixture({
    override: async () => {
      if (!held) {
        held = true;
        started();
        await blocked;
      }
      return undefined;
    },
  });
  const controller = new AbortController();
  const first = harness.request(controller.signal);
  await entered;
  controller.abort();
  expect((await first).status).toBe(503);
  release();
  expect(harness.calls).toHaveLength(1);
  expect((await harness.request()).status).toBe(200);
});

// 저장된 행사·스냅샷의 식별자나 수치가 계약과 다르면 새 예보를 발행하지 않는다
it.each(["다른 행사", "잘못된 목록", "누락된 수치", "반복된 예보"])(
  "%s 응답은 503으로 차단한다",
  async (failure) => {
    const harness = reforecastFixture({
      override: async ({ url, method }) => {
        if (failure === "다른 행사" && /\/events\/e-[^/]+$/.test(url.pathname))
          return Response.json({
            ...harness.event,
            id: "e-busan-fireworks-2026",
          });
        if (
          failure === "잘못된 목록" &&
          url.pathname.endsWith("/snapshots") &&
          method === "GET"
        )
          return Response.json({ items: [] });
      },
      forecast: (forecast) => {
        if (failure === "누락된 수치")
          return {
            ...forecast,
            dailyMean: { ...forecast.dailyMean, p50: null },
          } as unknown as typeof forecast;
        if (failure === "반복된 예보") {
          const previous = structuredClone(forecast);
          previous.id = "f-reforecast-1";
          return previous;
        }
        return forecast;
      },
    });
    if (failure === "반복된 예보")
      expect((await harness.request()).status).toBe(200);
    const published = harness.calls.filter((call) =>
      call.url.pathname.endsWith("/publish"),
    ).length;
    expect((await harness.request()).status).toBe(503);
    expect(
      harness.calls.filter((call) => call.url.pathname.endsWith("/publish")),
    ).toHaveLength(published);
  },
);

// 저장 성공처럼 보이는 잘못된 본문도 200으로 숨기지 않는다
it("records가 저장 내용을 바꿔 반환하면 503이다", async () => {
  const harness = reforecastFixture({
    override: async ({ url, method, body }) => {
      if (url.pathname.endsWith("/snapshots") && method === "POST")
        return Response.json({
          ...(body as object),
          publishedAt: "2026-09-20T00:00:00Z",
        });
    },
  });
  expect((await harness.request()).status).toBe(503);
});

// 같은 날 같은 조건이면 예보 id가 같아 새 스냅샷을 만들지 않고 변화 없음을 알린다
it("같은 예보 id가 다시 나오면 409 reforecast_unchanged이고 저장하지 않는다", async () => {
  const harness = reforecastFixture({
    forecast: (forecast, attempt) =>
      attempt === 2
        ? JSON.parse(
            JSON.stringify(forecast).replaceAll(forecast.id, "f-reforecast-1"),
          )
        : forecast,
  });
  expect((await harness.request()).status).toBe(200);
  const response = await harness.request();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: "reforecast_unchanged",
  });
  expect(harness.snapshots).toHaveLength(1);
});
