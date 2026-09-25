// 이미지의 원문 바이트·유형·404와 기준 그래프 계약 검증을 확인한다
import { expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { proxyConfig } from "./proxy-fixture.js";

// 텍스트 재인코딩 없이 바이너리와 Content-Type을 그대로 전달한다
it.each([200, 404])("이미지 HTTP %s·바이트·유형을 보존한다", async (status) => {
  const raw = new Uint8Array([0, 255, 128, 13, 10]);
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(raw, { status, headers: { "content-type": "image/webp" } }),
  );
  const result = await createApp(proxyConfig, fetcher).request(
    "/api/images/e-seoul-fireworks",
  );
  expect(result.status).toBe(status);
  expect(result.headers.get("content-type")).toBe("image/webp");
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(raw);
  expect(fetcher.mock.calls[0][0]).toBe(
    "http://forecast.test/v1/images/e-seoul-fireworks",
  );
});

// 오류와 경로 조작은 정상이미지로 내보내지 않는다
it("이미지 입력·서비스 오류를 구분한다", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 500 }),
  );
  const app = createApp(proxyConfig, fetcher);
  expect((await app.request("/api/images/invalid")).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await app.request("/api/images/e-seoul-fireworks")).status).toBe(503);
});

const graph = {
  masterVersion: 1,
  generatedAt: "2026-09-25T12:00:00+09:00",
  nodes: [{ id: "cc:Festival", kind: "class", label: "행사" }],
  edges: [],
};

// 고정 경로 graph는 개별 근거 조회보다 먼저 매칭하고 계약 위반은 차단한다
it("근거 그래프를 그대로 전달하고 잘못된 그래프는 거부한다", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(graph));
  const app = createApp(proxyConfig, fetcher);
  const response = await app.request("/api/evidence/graph");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(graph);
  expect(fetcher.mock.calls[0][0]).toBe(
    "http://knowledge.test/v1/master/graph",
  );
  fetcher.mockResolvedValueOnce(
    Response.json({
      ...graph,
      nodes: [{ id: "cc:Festival", kind: "invalid", label: "행사" }],
    }),
  );
  expect((await app.request("/api/evidence/graph")).status).toBe(503);
});
