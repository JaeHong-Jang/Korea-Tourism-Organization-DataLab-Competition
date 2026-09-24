// records 중계의 미디어 타입·상태 코드·취소·원시 경로 차단을 검증한다
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { DOCX_CONTENT_TYPE } from "../src/clients/records-relay-client.js";
import { plan, proxyConfig } from "./proxy-fixture.js";

// 예상한 장애 로그만 숨기고 시계·스파이는 테스트마다 복원한다
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 본문이 유효한 JSON이어도 미디어 타입이 맞아야 파싱한다
it.each([null, "text/plain", "text/html", "application/problem+json"])(
  "records JSON 응답 MIME %s를 거부한다",
  async (contentType) => {
    const upstream = new Response("[]", {
      headers: contentType ? { "content-type": contentType } : {},
    });
    if (!contentType) upstream.headers.delete("content-type");
    const response = await createApp(proxyConfig, async () => upstream).request(
      "/api/records/ledger",
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty(
      "code",
      "UPSTREAM_UNAVAILABLE",
    );
  },
);

// 매개변수와 대소문자는 MIME 본체 비교에 영향을 주지 않는다
it("JSON 응답 MIME 매개변수를 허용한다", async () => {
  const response = await createApp(
    proxyConfig,
    async () =>
      new Response("[]", {
        headers: { "content-type": "Application/JSON; charset=utf-8" },
      }),
  ).request("/api/records/ledger");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
});

// 계약에 없는 415 대신 400이며 본문 파싱과 상류 전송보다 앞에서 거부한다
it.each(["POST", "PUT"])(
  "%s JSON 아닌 요청은 읽지 않고 400",
  async (method) => {
    for (const contentType of [
      null,
      "text/plain",
      "application/problem+json",
    ]) {
      const request = new Request(
        `http://gateway.test/api/records/plans${method === "PUT" ? `/${plan.id}` : ""}`,
        {
          method,
          body: JSON.stringify(plan),
          headers: contentType ? { "content-type": contentType } : {},
        },
      );
      if (!contentType) request.headers.delete("content-type");
      const read = vi.spyOn(request, "text");
      const fetcher = vi.fn<typeof fetch>();
      const response = await createApp(proxyConfig, fetcher).fetch(request);
      expect(response.status).toBe(400);
      expect(request.bodyUsed).toBe(false);
      expect(read).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  },
);

// 모든 records 응답은 정해진 성공 상태만 전달하고 리다이렉트를 추적하지 않는다
it.each([201, 206, 301, 302, 307, 308])(
  "records HTTP %i를 거부한다",
  async (status) => {
    for (const docx of [false, true]) {
      const fetcher = vi.fn<typeof fetch>(
        async () =>
          new Response(docx ? "문서" : "[]", {
            status,
            headers: {
              "content-type": docx ? DOCX_CONTENT_TYPE : "application/json",
              location: "http://redirect.test/private",
            },
          }),
      );
      const response = await createApp(proxyConfig, fetcher).request(
        docx
          ? `/api/records/plans/${plan.id}/export.docx`
          : "/api/records/ledger",
      );
      expect(response.status).toBe(503);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
    }
  },
);

// 본문 있는 요청과 docx도 브라우저 종료를 같은 취소 신호로 전달한다
it.each([
  ["GET", "ledger"],
  ["GET", `plans/${plan.id}/export.docx`],
  ["POST", "plans"],
  ["PUT", `plans/${plan.id}`],
])("%s %s 연결 취소", async (method, path) => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const pending = createApp(proxyConfig, fetcher).request(
    `/api/records/${path}`,
    {
      method,
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(plan),
    },
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  controller.abort();
  expect((await pending).status).toBe(503);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

// 표준 Request 생성 이전의 URL을 보존하는 실행 환경도 점 세그먼트를 거부한다
it.each([
  "./ledger",
  "tmp/../ledger",
  "%2e/ledger",
  "tmp/%2E%2e/ledger",
  "tmp/.%2e/ledger",
])("raw.url의 %s를 404로 거부한다", async (path) => {
  const request = new Request("http://gateway.test/api/records/ledger");
  Object.defineProperty(request, "url", {
    value: `http://gateway.test/api/records/${path}`,
  });
  const fetcher = vi.fn<typeof fetch>();
  expect((await createApp(proxyConfig, fetcher).fetch(request)).status).toBe(
    404,
  );
  expect(fetcher).not.toHaveBeenCalled();
});
