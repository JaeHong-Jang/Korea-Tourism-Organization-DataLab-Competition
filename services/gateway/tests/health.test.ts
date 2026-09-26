// 서비스별 장애·Ollama 분리·병렬 마감을 실제 네트워크 없이 검증한다
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

const config = readConfig({});

// 다음 테스트에 가짜 시계가 남지 않게 한다
afterEach(() => vi.useRealTimers());

// 건강한 서비스와 실패한 서비스가 서로의 상태를 덮어쓰지 않는지 확인한다
describe("GET /api/health", () => {
  // Ollama가 꺼져도 앱 서비스 상태와 HTTP 성공을 유지한다
  it("앱 서비스 상태와 Ollama 연결 실패를 분리한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/api/version"))
        throw new TypeError("연결 실패");
      return Response.json({ status: "ok", version: "0.1.0" });
    });
    const response = await createApp(config, fetcher).request("/api/health");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      services: {
        forecast: { ok: true, latencyMs: expect.any(Number) },
        knowledge: { ok: true, latencyMs: expect.any(Number) },
        records: { ok: true, latencyMs: expect.any(Number) },
      },
      ollama: { ok: false, host: config.ollamaHost },
    });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      `${config.services.forecast}/health`,
      `${config.services.knowledge}/health`,
      `${config.services.records}/health`,
      `${config.ollamaHost}/api/version`,
    ]);
    for (const service of Object.values(body.services) as {
      latencyMs: number;
    }[]) {
      expect(Number.isInteger(service.latencyMs)).toBe(true);
      expect(service.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  // 비정상 HTTP와 계약 위반은 각각 해당 서비스만 실패로 표시한다
  it("Ollama 정상일 때도 백엔드 HTTP 오류와 잘못된 health 본문을 보고한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith(config.services.forecast))
        return new Response("오류", { status: 503 });
      if (url.startsWith(config.services.knowledge))
        return Response.json({ status: "ok" });
      if (url.endsWith("/api/version"))
        return Response.json({ version: "0.34.1" });
      return Response.json({ status: "ok", version: "0.1.0" });
    });
    const response = await createApp(config, fetcher).request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      services: {
        forecast: { ok: false },
        knowledge: { ok: false },
        records: { ok: true },
      },
      ollama: { ok: true, host: config.ollamaHost },
    });
  });

  // 연결이 유지돼도 Ollama의 실패 상태 코드는 정상으로 보고하지 않는다
  it("Ollama HTTP 오류를 실패로 표시한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/api/version")
        ? new Response(null, { status: 503 })
        : Response.json({ status: "ok", version: "0.1.0" }),
    );
    const response = await createApp(config, fetcher).request("/api/health");
    expect(response.status).toBe(200);
    expect((await response.json()).ollama).toEqual({
      ok: false,
      host: config.ollamaHost,
    });
  });

  // 네 요청이 모두 응답하지 않아도 합산 8초가 아닌 2초에 돌아온다
  it("모든 연결에 독립적인 2초 제한을 적용하고 중단 신호를 보낸다", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    let completed = false;
    const pending = Promise.resolve(
      createApp(config, fetcher).request("/api/health"),
    ).then((response) => {
      completed = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(completed).toBe(false);

    // 마감 순간 모든 장애를 HTTP 200 본문의 개별 상태로 수렴한다
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      services: {
        forecast: { ok: false },
        knowledge: { ok: false },
        records: { ok: false },
      },
      ollama: { ok: false, host: config.ollamaHost },
    });
    expect(fetcher.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
