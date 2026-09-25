// 발행 승인 전 노출 금지와 템플릿·스냅샷의 실제 스트림 경로를 검증한다
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import masterIds from "@crowdcast/contracts/jsonld/master-ids.json";
// @ts-expect-error 계약 무결성 검사는 JavaScript로 배포된다
import * as integrity from "@crowdcast/contracts/rules/integrity.mjs";
import type {
  Claim,
  ForecastReport,
  GateReport,
} from "@crowdcast/contracts/types";
import { describe, expect, it, vi } from "vitest";
import { checkNumbers } from "../src/team/verification/number-check.js";
import { MODEL_NOTICE } from "../src/team/verification/skeptic.js";
import { teamFixture, validSequence } from "./team-fixture.js";

describe("설명 발행", () => {
  // 실제 HTTP 발행 호출이 도착했을 때까지 trace에 문장·근거가 전혀 없어야 한다
  it("발행 승인 뒤 문장·근거·스냅샷을 보내고 같은 예보 id로 끝난다", async () => {
    let sessionId = "";
    const harness = teamFixture({
      override: async ({ url }) => {
        if (url.pathname.endsWith("/publish"))
          expect(
            harness
              .trace(sessionId)
              .filter((item) =>
                ["claim", "evidence", "suggest"].includes(item.event),
              ),
          ).toEqual([]);
        return undefined;
      },
    });
    sessionId = await harness.prepare();
    const events = await harness.message(sessionId);
    validSequence(events);
    const report = harness.calls.find((call) =>
      call.url.pathname.endsWith("/snapshots"),
    )?.body as ForecastReport;
    expect(report).toBeDefined();
    // 선택한 검증 실행에서만 실제 knowledge 재검증용 사실 요청을 내보낸다
    if (process.env.T304_FACTS_OUT)
      writeFileSync(
        process.env.T304_FACTS_OUT,
        JSON.stringify({
          sessionId,
          facts: harness.calls
            .filter((call) => call.url.pathname.endsWith("/facts"))
            .map((call) => call.body),
        }),
      );
    expect(
      integrity.refProblems(
        report,
        "forecast-report",
        integrity.masterSets(masterIds, ["mr-v0-1-0"]),
      ),
    ).toEqual([]);
    const publishIndex = harness.calls.findIndex((call) =>
      call.url.pathname.endsWith("/publish"),
    );
    expect(
      harness.calls.findIndex((call) =>
        call.url.pathname.endsWith("/snapshots"),
      ),
    ).toBeGreaterThan(publishIndex);
    expect(
      events
        .filter((event) => event.event === "claim")
        .map((event) => event.data),
    ).toEqual(report.claims);
    expect(report.claims.some((claim) => claim.text === MODEL_NOTICE)).toBe(
      true,
    );
    for (const claim of report.claims) {
      expect(claim.evidenceIds.length).toBeGreaterThan(0);
      expect(checkNumbers(claim as Claim, report.forecast).passed).toBe(true);
      expect(
        claim.checks.every(
          (check) => check.passed && check.revision === report.revision,
        ),
      ).toBe(true);
      const step = harness
        .trace(sessionId)
        .find(
          (item) =>
            item.event === "agent_step" &&
            item.data.stepId === claim.generatedBy.stepId,
        );
      expect(step?.data.agentId).toBe("explainer");
    }
    expect(report.brief.claimIds.length).toBeLessThanOrEqual(3);
    for (const action of report.brief.actions)
      expect(
        report.claims.find((claim) => `check-${claim.id}` === action.id)
          ?.rendered,
      ).toBe(action.label);
    expect(events.at(-1)).toMatchObject({
      data: { forecastId: report.forecastId },
    });
    expect(events.find((event) => event.event === "suggest")?.data).toEqual({
      actions: report.brief.actions,
    });
  });

  // 모델 호출이 실패해도 템플릿이 검사·발행 경로를 모두 거친다
  it("Ollama 연결 실패는 템플릿 발행으로 끝난다", async () => {
    const harness = teamFixture({
      env: { LLM_MODE: "ollama" },
      override: async ({ url }) => {
        if (url.pathname === "/api/chat") throw new TypeError("Ollama 꺼짐");
        return undefined;
      },
    });
    const id = await harness.create();
    const { answer } = await import("./team-fixture.js");
    await harness.message(id, { text: "영종 불꽃축제를 열어요" });
    let events = await harness.message(id, { text: "행사 확인", answer });
    if (events.some((event) => event.event === "ask"))
      events = await harness.message(id);
    validSequence(events);
    expect(
      events
        .filter((event) => event.event === "gate")
        .map((event) => (event.data as GateReport).gate),
    ).toEqual(["A", "B", "publish"]);
    expect(events.some((event) => event.event === "claim")).toBe(true);
    expect(events.some((event) => event.event === "error")).toBe(false);
    expect(JSON.stringify(events)).toContain("템플릿 설명");
  });

  // 각 저장에 지연이 있어도 행사와 스냅샷이 마감 안에 완료되면 안내를 붙이지 않는다
  it("행사와 스냅샷을 각각 1.5초에 저장하면 실패 안내가 없다", async () => {
    const harness = teamFixture({
      override: async ({ url, body }) => {
        if (
          url.pathname === "/v1/events" ||
          url.pathname.endsWith("/snapshots")
        ) {
          await delay(1_500);
          return Response.json(body);
        }
      },
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(events.at(-1)?.data).toMatchObject({
      forecastId: expect.any(String),
    });
    expect(JSON.stringify(events)).not.toContain("snapshot-unavailable");
    expect(
      harness.calls.some((call) => call.url.pathname.endsWith("/snapshots")),
    ).toBe(true);
  });

  // 저장 실패나 지연이 원자적 발행을 되돌리거나 완료 id를 지우지 않는다
  it("스냅샷 예산은 요청의 남은 시간을 넘지 않는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = teamFixture({
      deadlineMs: 600,
      override: async ({ url }) => {
        if (url.pathname.endsWith("/snapshots")) return new Promise(() => {});
      },
    });
    const id = await harness.prepare();
    const start = performance.now();
    const events = await harness.message(id);
    expect(performance.now() - start).toBeLessThan(1_500);
    validSequence(events);
    expect(events.at(-1)?.data).toMatchObject({
      forecastId: expect.any(String),
    });
    expect(JSON.stringify(events)).toContain("snapshot-unavailable");
  });

  // 전송 실패와 자체 저장 마감은 같은 안내를 남긴다
  it.each(["failure", "timeout"])(
    "스냅샷 %s는 안내를 붙이고 발행 id를 보존한다",
    async (mode) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
      const harness = teamFixture({
        override: async ({ url }) => {
          if (!url.pathname.endsWith("/snapshots")) return;
          if (mode === "timeout") return new Promise(() => {});
          return new Response(null, { status: 503 });
        },
      });
      const events = await harness.message(await harness.prepare());
      validSequence(events);
      expect(events.at(-1)?.data).toMatchObject({
        forecastId: expect.any(String),
      });
      expect(
        (
          events.find((event) => event.event === "suggest")?.data as {
            actions: unknown[];
          }
        )?.actions,
      ).toContainEqual({
        id: "snapshot-unavailable",
        label: "예보서 링크를 만들지 못했어요",
      });
      expect(warning).toHaveBeenCalledWith("발행 예보서 스냅샷 저장 실패");
      warning.mockRestore();
    },
    7_000,
  );
});
