// 해설 생성의 스키마·시간 예산·취소 경계에서도 템플릿 발행을 검증한다
import { setTimeout as delay } from "node:timers/promises";
import type { AgentStep, Claim, GateReport } from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import { MODEL_NOTICE } from "../src/team/verification/skeptic.js";
import { explanationFixture } from "./report-fixture.js";
import { validSequence } from "./team-fixture.js";

describe("해설 생성 대체 경로", () => {
  // 토큰 한도로 잘린 출력도 전송 장애 대신 출력 계약 오류로 기록한다
  it("미완결 출력은 schema 사유로 템플릿에 넘긴다", async () => {
    const harness = explanationFixture({
      override: async ({ url, body }) => {
        if (
          url.pathname === "/api/chat" &&
          JSON.stringify(body).includes("factors")
        )
          return Response.json({
            message: { content: '{"claims":[]}' },
            done: true,
            done_reason: "length",
          });
      },
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(JSON.stringify(events)).toContain("넘겨요(schema)");
    expect(events.some((event) => event.event === "claim")).toBe(true);
  });

  // 고정 문장을 출력하지 않는 LLM도 서버가 붙인 필수 고지와 함께 발행한다
  it("LLM은 최대 세 문장만 만들고 고정 문장은 서버가 붙인다", async () => {
    const harness = explanationFixture();
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(harness.attempts()).toBe(1);
    expect(JSON.stringify(events)).not.toContain("템플릿 설명");
    const claims = events
      .filter((event) => event.event === "claim")
      .map((event) => event.data as Claim);
    expect(claims.some((claim) => claim.text === MODEL_NOTICE)).toBe(true);
    expect(claims.some((claim) => claim.claimType === "판정")).toBe(true);
    const step = events.find(
      (event) =>
        event.event === "agent_step" &&
        (event.data as AgentStep).agentId === "explainer",
    )?.data as AgentStep;
    expect(step.usedLlm).toBe(true);
    expect(step.model).toBeTruthy();
  });

  // 설명할 요인이 없는 예보(지금 사용 모델)는 LLM을 부르지 않고 템플릿으로 발행한다
  it("요인이 없으면 LLM을 호출하지 않는다", async () => {
    const harness = explanationFixture({
      forecast: (forecast) => ({ ...forecast, factors: [] }),
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(harness.attempts()).toBe(0);
    expect(JSON.stringify(events)).toContain("설명할 요인이 없어");
    expect(events.some((event) => event.event === "claim")).toBe(true);
  });

  // 풀어 쓴 요인 문장은 뜻·부정·한글 수사를 검증할 수 없어 방향이 맞아도 발행하지 않는다
  it.each([
    "토요일 저녁에 열려 방문 인원이 늘어요",
    "방문 인원은 늘지 않아요",
    "방문 인원이 천 명 늘어요",
    "무료 입장이라 방문 인원이 늘어요",
    "토요일 저녁에 행사가 늘어나요",
  ])("풀어 쓴 요인 문장 '%s'는 발행하지 않는다", async (text) => {
    const harness = explanationFixture({
      rewrite: (claims) => claims.map((claim) => ({ ...claim, text })),
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(JSON.stringify(events)).toContain("넘겨요(schema)");
    expect(
      events.some(
        (event) =>
          event.event === "claim" && (event.data as Claim).text === text,
      ),
    ).toBe(false);
  });

  // 요인 문장이 그 요인에 없는 근거를 인용하면 스키마 위반으로 템플릿에 넘긴다
  it("다른 근거를 인용한 요인 문장은 schema로 남긴다", async () => {
    const harness = explanationFixture({
      rewrite: (claims) =>
        claims.map((claim) => ({ ...claim, evidenceIds: ["ev-not-a-factor"] })),
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(JSON.stringify(events)).toContain("넘겨요(schema)");
    expect(
      events
        .filter((event) => event.event === "claim")
        .some((event) =>
          (event.data as Claim).evidenceIds.includes("ev-not-a-factor"),
        ),
    ).toBe(false);
  });

  // 모델이 출력 범위·개수 계약을 어기면 고정 문장에 섞지 않고 템플릿을 재검증한다
  it.each(["고정 문장", "네 문장"])(
    "%s 출력은 schema로 남긴다",
    async (mode) => {
      const harness = explanationFixture({
        rewrite: (claims) =>
          mode === "고정 문장"
            ? [{ ...claims[0], claimType: "판정", text: "바뀐 판정" }]
            : Array.from({ length: 4 }, () => claims[0]),
      });
      const events = await harness.message(await harness.prepare());
      validSequence(events);
      expect(JSON.stringify(events)).toContain(
        "템플릿 설명을 검증팀에 넘겨요(schema)",
      );
      expect(events.some((event) => event.event === "claim")).toBe(true);
    },
  );

  // 오류 원문은 기록하지 않고 컨텍스트와 HTTP 실패 분류만 남긴다
  it.each([
    [400, "exceed_context_size_error", "context"],
    [503, "service failed", "http"],
  ])("%s 오류를 %s 원문 없이 %s로 기록한다", async (status, message, code) => {
    const harness = explanationFixture({
      override: async ({ url, body }) => {
        if (
          url.pathname === "/api/chat" &&
          JSON.stringify(body).includes("factors")
        )
          return Response.json(
            { error: `${message} PRIVATE_RAW` },
            { status: status as number },
          );
      },
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(JSON.stringify(events)).toContain(
      `템플릿 설명을 검증팀에 넘겨요(${code})`,
    );
    expect(JSON.stringify(events)).not.toContain("PRIVATE_RAW");
    expect(events.some((event) => event.event === "claim")).toBe(true);
  });

  // JSON 파싱 실패와 계약 밖 필드 모두 초안을 적재하기 전에 템플릿으로 바꾼다
  it.each(["not-json", '{"claims":[]}', '{"claims":[],"published":true}'])(
    "스키마 위반 %s",
    async (content) => {
      const harness = explanationFixture({
        override: async ({ url, body }) => {
          if (
            url.pathname !== "/api/chat" ||
            !JSON.stringify(body).includes("factors")
          )
            return;
          return Response.json({
            message: { content },
            done: true,
            done_reason: "stop",
            load_duration: 0,
            eval_count: 1,
          });
        },
      });
      const events = await harness.message(await harness.prepare());
      validSequence(events);
      expect(
        events
          .filter((event) => event.event === "gate")
          .map((event) => (event.data as GateReport).gate),
      ).toEqual(["A", "B", "publish"]);
      expect(events.some((event) => event.event === "claim")).toBe(true);
      expect(JSON.stringify(events)).toContain("템플릿 설명");
      expect(JSON.stringify(events)).toContain(
        content === "not-json" ? "넘겨요(parse)" : "넘겨요(schema)",
      );
    },
  );

  // 해설 예산보다 남은 시간이 적으면 생성 호출을 생략하고 그래프 검사 시간을 남긴다
  it("짧은 요청 예산에서는 해설 LLM을 호출하지 않는다", async () => {
    const harness = explanationFixture({ deadlineMs: 1_500 });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(harness.attempts()).toBe(0);
    expect(events.some((event) => event.event === "claim")).toBe(true);
    const step = events.find(
      (event) =>
        event.event === "agent_step" &&
        (event.data as AgentStep).agentId === "explainer",
    )?.data as AgentStep;
    expect(step.usedLlm).toBe(false);
    expect(step.model).toBeNull();
  });

  // 취소를 무시한 LLM도 예산에 끊고 늦게 온 응답은 그래프·스트림을 바꾸지 못한다
  it("LLM 시간 초과 뒤 템플릿으로 발행하고 늦은 응답을 격리한다", async () => {
    let release: (response: Response) => void = () => {};
    const stalled = new Promise<Response>((resolve) => {
      release = resolve;
    });
    let signal: AbortSignal | null | undefined;
    const harness = explanationFixture({
      override: async ({ url, body, signal: current }) => {
        if (
          url.pathname !== "/api/chat" ||
          !JSON.stringify(body).includes("factors")
        )
          return;
        signal = current;
        return stalled;
      },
    });
    const id = await harness.prepare();
    const events = await harness.message(id);
    validSequence(events);
    expect(events.some((event) => event.event === "claim")).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(JSON.stringify(events)).toContain("넘겨요(timeout)");
    const trace = harness.trace(id);
    const calls = harness.calls.length;
    release(
      Response.json({ message: { content: '{"claims":[]}' }, done: true }),
    );
    await delay(20);
    expect(harness.trace(id)).toEqual(trace);
    expect(harness.calls).toHaveLength(calls);
  }, 12_000);
});
