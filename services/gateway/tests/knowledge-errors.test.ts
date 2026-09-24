// 근거 적재의 검증된 오류 본문과 검증·발행의 상태 전용 충돌을 확인한다
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeClient } from "../src/clients/knowledge-client.js";
import { ServiceHttpError } from "../src/clients/request-json.js";
import { eventFixture, readContractFixture } from "./contract-fixture.js";

// 지연 테스트의 가짜 시계가 다른 검증에 남지 않게 한다
afterEach(() => vi.useRealTimers());

// 실제 적재 메서드를 거쳐 422 응답 스키마 선택까지 검사한다
function addFacts(fetcher: typeof fetch) {
  return createKnowledgeClient({
    baseUrl: "http://127.0.0.1:8020",
    fetch: fetcher,
    timeoutMs: 50,
  }).addFacts("s-yeongjong", { schema: "event", items: [eventFixture()] });
}

// 오류 응답은 HTTP 실패를 유지하면서 계약으로 보장된 정보만 노출한다
describe("knowledge 오류 응답", () => {
  // 무결성 거부 사유를 다음 게이트 단계가 사용할 수 있어야 한다
  it("facts 422의 gate-report를 보존한다", async () => {
    const body = readContractFixture(
      "gate-report/valid-integrity-rejected.json",
    );
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(body, { status: 422 }),
    );
    const result = addFacts(fetcher);
    await expect(result).rejects.toBeInstanceOf(ServiceHttpError);
    await expect(result).rejects.toMatchObject({ status: 422, body });
    await expect(result).rejects.toThrow("백엔드 HTTP 오류: 422");
  });

  // HTTP 상태가 맞아도 스키마에 어긋난 게이트 본문을 반환하지 않는다
  it("facts 422의 invalid 픽스처를 거부한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        readContractFixture("gate-report/invalid-unknown-gate.json"),
        { status: 422 },
      ),
    );
    await expect(addFacts(fetcher)).rejects.toThrow(
      "서비스 오류 응답 계약 위반",
    );
  });

  // 계약된 오류도 파싱 실패를 정상 gate-report로 바꾸지 않는다
  it("facts 422의 깨진 JSON을 거부한다", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response("{", { status: 422 }),
    );
    await expect(addFacts(fetcher)).rejects.toBeInstanceOf(SyntaxError);
  });

  // 성공 응답도 OpenAPI가 요구한 정수 revision을 가져야 한다
  it.each([{}, { revision: "3" }, { revision: 1.5 }])(
    "잘못된 facts 성공 응답 %j를 거부한다",
    async (body) => {
      const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
      await expect(addFacts(fetcher)).rejects.toThrow("서비스 응답 계약 위반");
    },
  );

  // 오류 본문 다운로드에도 정상 응답과 같은 시간 제한을 적용한다
  it("facts 422의 본문 지연을 중단한다", async () => {
    vi.useFakeTimers();
    const stream = new TransformStream();
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(stream.readable, { status: 422 }),
    );
    const result = expect(addFacts(fetcher)).rejects.toThrow("시간 제한 초과");
    await vi.advanceTimersByTimeAsync(50);
    await result;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await stream.writable.abort();
  });

  // 본문 계약이 없는 상태는 JSON 해석 없이 버리고 HTTP 상태만 전달한다
  it.each([
    ["validateSession", 409],
    ["publishSession", 409],
    ["validateSession", 422],
    ["publishSession", 503],
  ] as const)("%s의 %s는 본문을 노출하지 않는다", async (method, status) => {
    const response = new Response("{", { status });
    const json = vi.spyOn(response, "json");
    const cancel = vi.spyOn(response.body as ReadableStream, "cancel");
    const client = createKnowledgeClient({
      baseUrl: "http://127.0.0.1:8020",
      fetch: vi.fn<typeof fetch>(async () => response),
    });
    await expect(client[method]("s-yeongjong", 2, 1)).rejects.toMatchObject({
      status,
      body: undefined,
    });
    expect(json).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  // 같은 경로라도 등록되지 않은 상태의 본문은 유효한 게이트 모양이어도 버린다
  it("facts 503에는 422 스키마를 적용하지 않는다", async () => {
    const response = Response.json(
      readContractFixture("gate-report/valid-integrity-rejected.json"),
      { status: 503 },
    );
    const json = vi.spyOn(response, "json");
    await expect(addFacts(async () => response)).rejects.toMatchObject({
      status: 503,
      body: undefined,
    });
    expect(json).not.toHaveBeenCalled();
  });
});
