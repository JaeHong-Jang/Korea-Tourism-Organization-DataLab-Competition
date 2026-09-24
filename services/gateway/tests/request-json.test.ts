// 전송 실패·잘못된 JSON·본문 지연에도 클라이언트가 명확하게 실패하는지 검증한다
import { afterEach, describe, expect, it, vi } from "vitest";
import { createForecastClient } from "../src/clients/forecast-client.js";
import { createKnowledgeClient } from "../src/clients/knowledge-client.js";
import { createRecordsClient } from "../src/clients/records-client.js";
import { ServiceHttpError } from "../src/clients/request-json.js";
import { eventFixture, readContractFixture } from "./contract-fixture.js";

// 공유 전송 계층을 세 서비스의 실제 메서드로 호출한다
const cases = [
  {
    name: "forecast",
    call: (fetcher: typeof fetch) =>
      createForecastClient({
        baseUrl: "http://127.0.0.1:8010",
        fetch: fetcher,
        timeoutMs: 50,
      }).predict(eventFixture()),
  },
  {
    name: "knowledge",
    call: (fetcher: typeof fetch) =>
      createKnowledgeClient({
        baseUrl: "http://127.0.0.1:8020",
        fetch: fetcher,
        timeoutMs: 50,
      }).getEvidence("ev-yeongjong"),
  },
  {
    name: "records",
    call: (fetcher: typeof fetch) =>
      createRecordsClient({
        baseUrl: "http://127.0.0.1:8030",
        fetch: fetcher,
        timeoutMs: 50,
      }).getEvent("e-yeongjong"),
  },
];

// 가짜 타이머를 테스트 밖으로 누출하지 않는다
afterEach(() => vi.useRealTimers());

// 전송 오류를 정상 도메인 결과로 오해하지 않게 한다
describe.each(cases)("$name 전송 실패", ({ call }) => {
  // HTTP 오류는 응답 본문을 도메인 값으로 해석하기 전에 거부한다
  it("HTTP 오류의 상태 코드를 보존한다", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response("오류", { status: 503 }),
    );
    await expect(call(fetcher)).rejects.toMatchObject({
      name: "ServiceHttpError",
      status: 503,
    });
    expect(new ServiceHttpError(409).status).toBe(409);
  });

  // 문법이 잘못된 JSON은 계약 검증보다 먼저 실패한다
  it("깨진 JSON을 거부한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{"));
    await expect(call(fetcher)).rejects.toBeInstanceOf(SyntaxError);
  });

  // 연결 오류를 삼켜 빈 결과로 돌려주지 않는다
  it("연결 실패를 호출자에게 전달한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("연결 실패"));
    await expect(call(fetcher)).rejects.toThrow("연결 실패");
  });

  // 취소를 무시하는 가짜 fetch에도 클라이언트의 시간 예산을 지킨다
  it("연결 지연을 중단하고 타이머를 정리한다", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    const result = expect(call(fetcher)).rejects.toThrow("시간 제한 초과");
    await vi.advanceTimersByTimeAsync(50);
    await result;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  // 응답 헤더가 도착한 뒤 멈춘 본문도 같은 마감으로 제한한다
  it("JSON 본문을 기다리는 시간까지 제한한다", async () => {
    vi.useFakeTimers();
    const stream = new TransformStream();
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(stream.readable),
    );
    const result = expect(call(fetcher)).rejects.toThrow("시간 제한 초과");
    await vi.advanceTimersByTimeAsync(50);
    await result;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await stream.writable.abort();
  });
});

// 정상 반환 뒤에도 마감 타이머가 남아 완료된 요청을 취소하면 안 된다
it("정상 요청을 완료하면 마감 타이머를 제거한다", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(readContractFixture("forecast/valid-yeongjong.json")),
  );
  await cases[0].call(fetcher);
  expect(vi.getTimerCount()).toBe(0);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
});
