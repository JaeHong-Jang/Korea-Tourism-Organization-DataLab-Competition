// 실제 Node HTTP 어댑터에서 경로 정규화·리다이렉트·연결 종료를 검증한다
import { once } from "node:events";
import { createServer, get, type Server } from "node:http";
import { serve } from "@hono/node-server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { proxyConfig } from "./proxy-fixture.js";

// 임의 포트 리스너를 테스트마다 닫아 다른 레인 서비스와 충돌하지 않는다
const servers: Server[] = [];
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  vi.restoreAllMocks();
});

// 이미 열린 서버에서도 실제 배정 포트를 안전하게 읽는다
async function listen(server: Server) {
  servers.push(server);
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("테스트 포트 없음");
  return address.port;
}

// fetch의 URL 정규화를 피하고 원시 HTTP 요청 경로를 서버에 보낸다
function rawGet(port: number, path: string) {
  return new Promise<number | undefined>((resolve, reject) => {
    get({ hostname: "127.0.0.1", port, path }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    }).on("error", reject);
  });
}

// 어댑터가 raw.url에서 점 세그먼트를 지워도 원시 요청 검사가 중계를 차단한다
it("실제 HTTP 점 세그먼트를 404로 차단한다", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json([]));
  const port = await listen(
    serve({
      fetch: createApp(proxyConfig, fetcher).fetch,
      hostname: "127.0.0.1",
      port: 0,
    }) as Server,
  );
  for (const path of [
    "./ledger",
    "tmp/../ledger",
    "%2e/ledger",
    "tmp/%2E%2e/ledger",
    "tmp/.%2e/ledger",
    "tmp/%2e./ledger",
  ]) {
    expect(await rawGet(port, `/api/records/${path}`)).toBe(404);
  }
  expect(fetcher).not.toHaveBeenCalled();
  expect(await rawGet(port, "/api/records/ledger")).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

// 진짜 fetch가 Location 주소를 추가로 요청하지 않는지 두 서버로 확인한다
it("리다이렉트 대상에 실제 요청을 보내지 않는다", async () => {
  const destination = vi.fn((_request, response) => {
    response.end("[]");
  });
  const destinationPort = await listen(
    createServer(destination).listen(0, "127.0.0.1"),
  );
  const upstreamPort = await listen(
    createServer((_request, response) => {
      response.writeHead(302, {
        location: `http://127.0.0.1:${destinationPort}/private`,
      });
      response.end();
    }).listen(0, "127.0.0.1"),
  );
  const app = createApp({
    ...proxyConfig,
    services: {
      ...proxyConfig.services,
      forecast: `http://127.0.0.1:${upstreamPort}`,
    },
  });
  expect((await app.request("/api/festivals")).status).toBe(503);
  expect(destination).not.toHaveBeenCalled();
});

// 브라우저 소켓 종료가 Hono의 signal을 통해 진행 중인 상류까지 전달된다
it("실제 연결 종료를 상류로 전파한다", async () => {
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const port = await listen(
    serve({
      fetch: createApp(proxyConfig, fetcher).fetch,
      hostname: "127.0.0.1",
      port: 0,
    }) as Server,
  );
  const request = get({ hostname: "127.0.0.1", port, path: "/api/festivals" });
  request.on("error", () => {});
  await expect.poll(() => fetcher.mock.calls.length).toBe(1);
  const signal = fetcher.mock.calls[0][1]?.signal;
  expect(signal?.aborted).toBe(false);
  request.destroy();
  await expect.poll(() => signal?.aborted).toBe(true);
});
