// records 중계의 허용 목록·요청 검증·응답 검증·바이너리 보존을 확인한다
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { DOCX_CONTENT_TYPE } from "../src/clients/records-relay-client.js";
import { eventFixture } from "./contract-fixture.js";
import { plan, proxyConfig, report } from "./proxy-fixture.js";

// gateway.yaml에 명시된 각 메서드와 경로의 요청·응답을 별도로 검사한다
const recordsCases = [
  { method: "GET", path: "events", response: [eventFixture()] },
  {
    method: "GET",
    path: `events/${report.event.id}/snapshots`,
    response: [report],
  },
  { method: "GET", path: `plans/${plan.id}`, response: plan },
  { method: "GET", path: "ledger", response: [] },
  {
    method: "GET",
    path: "ledger/verify",
    response: { valid: true, count: 0, brokenAt: null },
  },
  { method: "GET", path: `snapshots/${report.forecastId}`, response: report },
  {
    method: "POST",
    path: "events",
    body: eventFixture(),
    response: eventFixture(),
  },
  { method: "POST", path: "plans", body: plan, response: plan },
  {
    method: "POST",
    path: "actuals",
    body: { eventId: report.event.id, actual: report.forecast.dailyMean },
    response: {},
  },
  {
    method: "POST",
    path: "shares",
    body: { forecastId: report.forecastId },
    response: { token: "yeongjong-share" },
  },
  { method: "PUT", path: `plans/${plan.id}`, body: plan, response: plan },
];

// 예상된 오류 로그와 가짜 타이머는 테스트마다 정리한다
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 허용 목록에 든 모든 JSON 경로가 같은 검증 경계를 지킨다
describe.each(recordsCases)("$method $path", (entry) => {
  // 본문 없는 조회와 JSON 변경 요청을 실제 메서드 그대로 보낸다
  it("정상 요청과 응답을 계약대로 중계한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(entry.response),
    );
    const response = await createApp(proxyConfig, fetcher).request(
      `/api/records/${entry.path}`,
      { method: entry.method, body: JSON.stringify(entry.body) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(entry.response);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `${proxyConfig.services.records}/v1/${entry.path}`,
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: entry.method,
      body: JSON.stringify(entry.body),
      redirect: "error",
    });
  });

  // 상류 연결 거부를 빈 목록이나 저장 성공으로 바꾸지 않는다
  it("연결 실패이면 503을 준다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("연결 거부"));
    const response = await createApp(proxyConfig, fetcher).request(
      `/api/records/${entry.path}`,
      { method: entry.method, body: JSON.stringify(entry.body) },
    );
    expect(response.status).toBe(503);
  });

  // 숫자나 불완전한 JSON은 성공 응답 계약으로 전달하지 않는다
  it("상류 계약 위반이면 503과 로그를 남긴다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(123));
    const response = await createApp(proxyConfig, fetcher).request(
      `/api/records/${entry.path}`,
      { method: entry.method, body: JSON.stringify(entry.body) },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty(
      "code",
      "UPSTREAM_UNAVAILABLE",
    );
    expect(console.error).toHaveBeenCalledWith("게이트웨이 중계 실패", {
      route: "/api/records/*",
      reason: "CONTRACT_VIOLATION",
    });
  });

  // 미구현 경로와 서비스 HTTP 오류를 동일하게 다룬다
  it.each([404, 503])("상류 HTTP %i이면 503을 준다", async (status) => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status }),
    );
    const response = await createApp(proxyConfig, fetcher).request(
      `/api/records/${entry.path}`,
      { method: entry.method, body: JSON.stringify(entry.body) },
    );
    expect(response.status).toBe(503);
  });
});

// records가 지원해도 gateway 허용 목록에 없으면 전송하지 않는다
it.each([
  ["GET", "events/e-yeongjong"],
  ["DELETE", "events/e-yeongjong"],
  ["POST", "ledger"],
  ["POST", "events/e-yeongjong/snapshots"],
  ["GET", "plans"],
  ["GET", "shares"],
  ["GET", "health"],
  ["PATCH", `plans/${plan.id}`],
  ["PUT", "events"],
  ["GET", "plans/plan-test/extra"],
  ["GET", "plans/plan-test/exportXdocx"],
  ["GET", "plans/plan-test%2fexport.docx"],
  ["GET", "plans/plan-test%252fexport.docx"],
  ["GET", "plans/plan-test%5c.."],
  ["GET", "plans/%zz"],
  ["GET", "events/"],
])("목록 밖 %s %s는 404", async (method, path) => {
  const fetcher = vi.fn<typeof fetch>();
  const response = await createApp(proxyConfig, fetcher).request(
    `/api/records/${path}`,
    { method },
  );
  expect(response.status).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
});

// 변경 요청은 JSON 문법과 중첩 스키마를 모두 검사한다
it.each(recordsCases.filter((entry) => entry.body !== undefined))(
  "$method $path 요청 계약 위반은 400",
  async (entry) => {
    const fetcher = vi.fn<typeof fetch>();
    for (const body of ["{", "null", "{}", undefined]) {
      const response = await createApp(proxyConfig, fetcher).request(
        `/api/records/${entry.path}`,
        { method: entry.method, body },
      );
      expect(response.status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  },
);

// 최상위 필드가 있어도 수치와 섹션 안의 타입이 잘못되면 전송하지 않는다
it.each([
  [
    "actuals",
    {
      eventId: report.event.id,
      actual: { ...report.forecast.dailyMean, value: "10" },
    },
  ],
  [
    "plans",
    {
      ...plan,
      sections: [{ ...plan.sections[0], body: 123 }, ...plan.sections.slice(1)],
    },
  ],
  ["events", { ...eventFixture(), type: "축제" }],
])("중첩 계약 위반 %s", async (path, body) => {
  const fetcher = vi.fn<typeof fetch>();
  expect(
    (
      await createApp(proxyConfig, fetcher).request(`/api/records/${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      })
    ).status,
  ).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

// gateway가 정의한 PUT 충돌만 보존하고 상류 원문 오류는 내보내지 않는다
it("오래된 계획 수정은 409로 보존한다", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response("내부 저장 오류 원문", { status: 409 }),
  );
  const response = await createApp(proxyConfig, fetcher).request(
    `/api/records/plans/${plan.id}`,
    { method: "PUT", body: JSON.stringify(plan) },
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    code: "CONFLICT",
    message: expect.any(String),
  });
});

// 바이너리 특수 바이트와 두 다운로드 헤더가 변하지 않는지 확인한다
it("docx의 바이트와 Content-Type·Content-Disposition을 보존한다", async () => {
  const bytes = new Uint8Array([80, 75, 3, 4, 0, 255, 128, 13, 10]);
  const headers = {
    "content-type": DOCX_CONTENT_TYPE,
    "content-disposition": "attachment; filename=yeongjong.docx",
  };
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(bytes, { headers }),
  );
  const response = await createApp(proxyConfig, fetcher).request(
    `/api/records/plans/${plan.id}/export.docx`,
  );
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  for (const [name, value] of Object.entries(headers))
    expect(response.headers.get(name)).toBe(value);
});

// JSON이나 HTML 오류 본문을 문서 다운로드로 오인하지 않는다
it.each(["application/json", "text/html", "application/octet-stream"])(
  "docx MIME %s는 503",
  async (contentType) => {
    const response = await createApp(
      proxyConfig,
      async () =>
        new Response("오류", { headers: { "content-type": contentType } }),
    ).request(`/api/records/plans/${plan.id}/export.docx`);
    expect(response.status).toBe(503);
    expect(console.error).toHaveBeenCalled();
  },
);

// 문서 상류가 없거나 아직 구현하지 않은 경우도 공통 장애를 따른다
it.each([404, 503, "offline"])("docx 상류 %s", async (status) => {
  const fetcher = vi.fn<typeof fetch>(async () => {
    if (status === "offline") throw new TypeError("연결 거부");
    return new Response(null, { status: Number(status) });
  });
  expect(
    (
      await createApp(proxyConfig, fetcher).request(
        `/api/records/plans/${plan.id}/export.docx`,
      )
    ).status,
  ).toBe(503);
});

// JSON과 바이너리 본문 모두 헤더 이후 멈춰도 5초를 넘기지 않는다
it.each([
  ["/api/regions.topojson", "application/json"],
  ["/api/evidence/stats", "application/json"],
  ["/api/records/ledger/verify", "application/json"],
  [`/api/records/plans/${plan.id}/export.docx`, DOCX_CONTENT_TYPE],
])("본문 지연 %s", async (path, contentType) => {
  vi.useFakeTimers();
  const stream = new TransformStream();
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(stream.readable, {
        headers: { "content-type": contentType },
      }),
  );
  const pending = createApp(proxyConfig, fetcher).request(path);
  await vi.advanceTimersByTimeAsync(5_000);
  expect((await pending).status).toBe(503);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await stream.writable.abort();
});
