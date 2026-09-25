// 게이트 거부·무결성·버전 충돌·지연에서 숫자와 발행 전 문장이 차단되는지 검증한다

import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { fakeForecastFetch } from "../src/team/runtime/fake-forecast.js";
import { readContractFixture } from "./contract-fixture.js";
import { isReplyCall, withoutReplyEvents } from "./reply-fixture.js";
import { teamFixture, validSequence } from "./team-fixture.js";

describe("분석 실패 차단", () => {
  // 출처 메타데이터·공개 시점 위반 모두 게이트 보고서와 분석 오류로 끝낸다
  it.each([
    ["S09", "공개 시점이 기준일 뒤입니다."],
    ["S04", "데이터셋 제목이 없습니다."],
    ["S04", "데이터셋 발행기관이 없습니다."],
  ])(
    "게이트 A의 %s 위반(%s) 뒤에는 숫자를 보내지 않는다",
    async (shapeId, message) => {
      const harness = teamFixture({
        override: async ({ url }) => {
          if (url.pathname.endsWith("/validate"))
            return Response.json({
              gate: "A",
              passed: false,
              revision: Number(url.searchParams.get("revision")),
              masterVersion: 7,
              violations: [
                {
                  check: "shacl",
                  shapeId,
                  nodeId: "obs-28110-sat-nonlocal",
                  message,
                },
              ],
            });
        },
      });
      const events = await harness.message(await harness.prepare());
      validSequence(events);
      expect(withoutReplyEvents(events).slice(-3)).toMatchObject([
        { event: "gate", data: { gate: "A", passed: false } },
        { event: "error", data: { code: "ANALYSIS_GATE_FAILED" } },
        { event: "done" },
      ]);
      expect(events.some((event) => event.event === "forecast")).toBe(false);
    },
  );

  // facts 거부 이후에는 검증 호출조차 하지 않는다
  it("끊긴 참조 422를 분석 오류로 반환한다", async () => {
    const harness = teamFixture({
      override: async ({ url, body }) => {
        if (
          url.pathname.endsWith("/facts") &&
          (body as { schema: string }).schema === "forecast"
        )
          return Response.json(
            readContractFixture("gate-report/valid-integrity-rejected.json"),
            { status: 422 },
          );
      },
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(withoutReplyEvents(events).at(-2)).toMatchObject({
      event: "error",
      data: { code: "ANALYSIS_GATE_FAILED" },
    });
    expect(
      events.some((event) => ["forecast", "gate"].includes(event.event)),
    ).toBe(false);
  });

  // 다른 버전의 통과 보고서를 현재 결과에 적용하지 않는다
  it.each(["revision", "masterVersion", "conflict"])(
    "%s 충돌은 통과로 보정하지 않는다",
    async (field) => {
      const harness = teamFixture({
        override: async ({ url }) => {
          if (!url.pathname.endsWith("/validate")) return;
          if (field === "conflict") return new Response(null, { status: 409 });
          return Response.json({
            gate: "A",
            passed: true,
            revision: 4,
            masterVersion: 7,
            violations: [],
            [field]: 99,
          });
        },
      });
      const events = await harness.message(await harness.prepare());
      validSequence(events);
      expect(withoutReplyEvents(events).at(-2)).toMatchObject({
        event: "error",
        data: { code: "ANALYSIS_GATE_FAILED" },
      });
      expect(events.some((event) => event.event === "forecast")).toBe(false);
    },
  );

  // 연결 실패를 숫자가 없는 정상 예보로 위장하지 않는다
  it("서비스 장애는 SERVICE_UNAVAILABLE로 끝난다", async () => {
    const harness = teamFixture({
      override: async ({ url }) => {
        if (url.pathname === "/v1/predict")
          throw new TypeError("민감한 서비스 원문");
        return undefined;
      },
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(withoutReplyEvents(events).at(-2)).toMatchObject({
      event: "error",
      data: { code: "SERVICE_UNAVAILABLE" },
    });
    expect(JSON.stringify(events)).not.toContain("민감한 서비스 원문");
    expect(events.some((event) => event.event === "forecast")).toBe(false);
  });

  // 늦은 응답은 취소 이후의 facts 쓰기·단계 기록·SSE 이벤트를 만들지 못한다
  it("마감 초과가 병렬 요청을 취소하고 늦은 결과를 격리한다", async () => {
    let release: () => void = () => {};
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });
    const harness = teamFixture({
      deadlineMs: 240,
      override: async ({ url }) => {
        if (["/v1/baseline", "/v1/similar"].includes(url.pathname))
          await stalled;
        return undefined;
      },
    });
    const id = await harness.prepare();
    const events = await harness.message(id);
    validSequence(events);
    expect(withoutReplyEvents(events).at(-2)).toMatchObject({
      event: "error",
      data: { code: "DEADLINE_EXCEEDED" },
    });
    const pending = harness.calls
      .filter((call) => !isReplyCall(call))
      .filter((call) =>
        ["/v1/baseline", "/v1/similar"].includes(call.url.pathname),
      );
    expect(pending).toHaveLength(2);
    expect(pending.every((call) => call.signal?.aborted)).toBe(true);
    const count = harness.calls.filter((call) => !isReplyCall(call)).length;
    const trace = harness.trace(id);
    release();
    await delay(25);
    expect(harness.calls.filter((call) => !isReplyCall(call))).toHaveLength(
      count,
    );
    expect(harness.trace(id)).toEqual(trace);
    expect(
      events
        .filter((event) => event.event === "agent_step")
        .map((event) => event.data),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: "local-guide", status: "error" }),
        expect.objectContaining({ agentId: "archivist", status: "error" }),
      ]),
    );
  });

  // 두 요청을 모두 만나야 해제되는 장벽으로 평시·유사 호출의 실제 병렬성을 확인한다
  it("평시·유사 조회를 병렬로 실행한다", async () => {
    let count = 0;
    let release: () => void = () => {};
    const both = new Promise<void>((resolve) => {
      release = resolve;
    });
    const harness = teamFixture({
      deadlineMs: 1_500,
      override: async ({ url }) => {
        if (["/v1/baseline", "/v1/similar"].includes(url.pathname)) {
          if (++count === 2) release();
          await both;
        }
        return undefined;
      },
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(count).toBe(2);
    expect(events.some((event) => event.event === "forecast")).toBe(true);
  });

  // 잘못된 행사 연결이나 기준일의 예보를 다른 행사 카드로 전달하지 않는다
  it.each(["eventId", "asOf"])("예보의 %s 불일치를 거부한다", async (field) => {
    const harness = teamFixture({
      override: async ({ url, body }) => {
        if (url.pathname !== "/v1/predict") return;
        const response = await fakeForecastFetch(url, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return Response.json({
          ...(await response.json()),
          [field]: field === "eventId" ? "e-busan-fireworks" : "2026-10-05",
        });
      },
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(withoutReplyEvents(events).at(-2)).toMatchObject({
      event: "error",
      data: { code: "SERVICE_UNAVAILABLE" },
    });
    expect(events.some((event) => event.event === "forecast")).toBe(false);
  });
});
