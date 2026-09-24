// 실제 네트워크 없이 Ollama 전송 옵션과 본문 읽기 마감을 검증한다
import { describe, expect, it, vi } from "vitest";
import { FAKE_EVENT_TEXT } from "../src/llm/fake-llm.js";
import { MAX_OUTPUT_TOKENS } from "../src/llm/models.js";
import { createLlmClient } from "../src/llm/ollama-client.js";

const request = {
  schema: { type: "object", additionalProperties: false },
  messages: [{ role: "user", content: "행사" }],
  recordingKey: FAKE_EVENT_TEXT,
};
const response = {
  done: true,
  done_reason: "stop",
  message: { role: "assistant", content: "{}" },
  load_duration: 1000000,
  eval_count: 2,
};

describe("Ollama 전송", () => {
  // 호스트·모델 설정과 제한된 생성 옵션을 SDK까지 전달한다
  it("스키마·토큰 상한·호스트를 강제한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(response));
    const client = createLlmClient({
      env: {
        OLLAMA_HOST: "http://127.0.0.1:11435",
        OLLAMA_MODEL_FAST: "qwen2.5:7b",
      },
      fetch: fetcher,
    });
    expect((await client.complete(request)).metrics.loadMs).toBe(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:11435/api/chat");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "qwen2.5:7b",
      format: request.schema,
      stream: false,
      options: { num_predict: MAX_OUTPUT_TOKENS, temperature: 0 },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  // fake 모드에서 SDK 인스턴스나 HTTP를 호출하지 않는다
  it("fake 모드는 녹화 응답만 읽는다", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await createLlmClient({
      env: { LLM_MODE: "fake" },
      fetch: fetcher,
    }).complete(request);
    expect(fetcher).not.toHaveBeenCalled();
  });

  // 요청과 응답 본문 중 어느 단계가 멈춰도 호출자의 예산을 넘지 않는다
  it.each(["transport", "body"])(
    "%s 지연을 마감하고 취소 신호를 전달한다",
    async (phase) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        phase === "transport"
          ? new Promise<Response>(() => {})
          : ({ ok: true, json: () => new Promise(() => {}) } as Response),
      );
      await expect(
        createLlmClient({
          env: { LLM_MODE: "ollama" },
          fetch: fetcher,
          timeoutMs: 15,
        }).complete(request),
      ).rejects.toThrow("시간 제한");
      expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    },
  );

  // 토큰 상한으로 잘리거나 도구 호출이 섞인 응답은 필드 추출로 취급하지 않는다
  it.each([
    { ...response, done_reason: "length" },
    { ...response, done: false },
    { ...response, message: { content: "{}", tool_calls: [{}] } },
  ])("불완전한 응답을 거부한다", async (body) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
    await expect(
      createLlmClient({ env: { LLM_MODE: "ollama" }, fetch: fetcher }).complete(
        request,
      ),
    ).rejects.toThrow("완결된 필드");
  });
});
