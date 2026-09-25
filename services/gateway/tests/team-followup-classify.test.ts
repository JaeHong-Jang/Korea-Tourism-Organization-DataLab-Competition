// 단일 규칙·모호한 LLM 분류·안내 경로를 실제 SSE와 작업 기록으로 확인한다
import { expect, it } from "vitest";
import {
  classificationResponse,
  followupFixture,
  isClassification,
  validFollowup,
} from "./followup-fixture.js";

// 준비 중이거나 범위 밖인 의도도 모두 기존 예보 id를 보존한다
it.each([
  ["비 오면?", "whatif", "비·요일을 바꿔 보는 기능은 준비 중이에요"],
  ["요일 바꾸면?", "whatif", "비·요일을 바꿔 보는 기능은 준비 중이에요"],
  [
    "다른 행사 예보를 해 줘",
    "new_event",
    "새 예보는 새 상담에서 시작해 주세요.",
  ],
])("%s는 %s 규칙으로 안내한다", async (text, intent, message) => {
  const harness = followupFixture();
  const { id, forecastId } = await harness.publish();
  const before = harness.calls.length;
  const events = await harness.message(id, { text });
  validFollowup(events, forecastId);
  expect(
    events.find((event) => event.event === "agent_step")?.data,
  ).toMatchObject({ note: `요청 분류: ${intent} (규칙)`, usedLlm: false });
  expect(events.at(-2)).toMatchObject({
    event: "error",
    data: { code: "OUT_OF_SCOPE", message },
  });
  expect(harness.calls.slice(before)).toHaveLength(0);
});

// 단어가 없는 날씨 질문과 충돌하는 키워드는 스키마를 강제해 한 번만 분류한다
it.each([
  ["내일 날씨 어때?", "out_of_scope"],
  ["이유를 설명하고 저장해 줘", "save"],
])("%s는 LLM을 한 번 호출하고 %s로 분류한다", async (text, intent) => {
  const harness = followupFixture({
    override: async (call) =>
      isClassification(call) ? classificationResponse(intent) : undefined,
  });
  const { id, forecastId } = await harness.publish();
  const before = harness.calls.length;
  const events = await harness.message(id, { text });
  validFollowup(events, forecastId);
  const calls = harness.calls.slice(before).filter(isClassification);
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toMatchObject({
    format: {
      additionalProperties: false,
      required: ["intent"],
      properties: {
        intent: {
          enum: ["why", "save", "draft", "whatif", "new_event", "out_of_scope"],
        },
      },
    },
  });
  expect(
    events.find((event) => event.event === "agent_step")?.data,
  ).toMatchObject({ note: `요청 분류: ${intent} (LLM)`, usedLlm: true });
  expect(JSON.stringify(events)).not.toContain(text);
  if (intent === "out_of_scope")
    expect(events.at(-2)?.data).toMatchObject({
      code: "OUT_OF_SCOPE",
      message: expect.stringContaining(
        "이유·근거 설명, 예보서 저장, 계획 초안",
      ),
    });
});

// 오류·enum 위반·출력 파손은 재시도하거나 임의 의도를 고르지 않는다
it.each(["error", "enum", "json"])(
  "분류 %s는 범위 밖 안내로 끝난다",
  async (mode) => {
    const harness = followupFixture({
      override: async (call) => {
        if (!isClassification(call)) return;
        if (mode === "error") throw new Error("원문을 로그에 남기면 안 됩니다");
        if (mode === "enum") return classificationResponse("weather");
        return Response.json({
          message: { role: "assistant", content: "{" },
          done: true,
          done_reason: "stop",
        });
      },
    });
    const { id, forecastId } = await harness.publish();
    const before = harness.calls.length;
    const events = await harness.message(id, {
      text: "이유와 저장을 같이 부탁해",
    });
    validFollowup(events, forecastId);
    expect(harness.calls.slice(before).filter(isClassification)).toHaveLength(
      1,
    );
    expect(
      events.find((event) => event.event === "agent_step")?.data,
    ).toMatchObject({ note: "요청 분류: out_of_scope (LLM)" });
    expect(events.at(-2)?.data).toMatchObject({ code: "OUT_OF_SCOPE" });
    expect(JSON.stringify(events)).not.toContain("원문을 로그");
  },
);

// Ollama가 취소를 무시해도 실행기 마감은 호출 한 번에서 종료한다
it("분류는 3초 시간 초과 뒤 범위 밖으로 끝난다", async () => {
  let signal: AbortSignal | null | undefined;
  const harness = followupFixture({
    override: async (call) => {
      if (isClassification(call)) {
        signal = call.signal;
        return new Promise(() => {});
      }
    },
  });
  const { id, forecastId } = await harness.publish();
  const before = harness.calls.length;
  const start = performance.now();
  const events = await harness.message(id, {
    text: "이유를 설명하고 저장해 줘",
  });
  validFollowup(events, forecastId);
  expect(performance.now() - start).toBeLessThan(3_700);
  expect(signal?.aborted).toBe(true);
  expect(harness.calls.slice(before).filter(isClassification)).toHaveLength(1);
  expect(
    events.filter((event) => event.event === "agent_step").at(-1)?.data,
  ).toMatchObject({ note: "요청 분류: out_of_scope (LLM)" });
  expect(events.at(-2)?.data).toMatchObject({ code: "OUT_OF_SCOPE" });
});
