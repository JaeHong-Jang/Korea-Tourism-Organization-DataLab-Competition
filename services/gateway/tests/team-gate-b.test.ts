// 위반 초안·재작성·템플릿과 발행 범위 충돌이 실제 스트림을 우회하지 못하게 한다
import { writeFileSync } from "node:fs";
import type { Claim, GateReport } from "@crowdcast/contracts/types";
import { describe, expect, it, vi } from "vitest";
import type { DraftText } from "../src/team/report/bundle.js";
import { explainer } from "../src/team/report/explainer.js";
import { explanationFixture, oodForecast } from "./report-fixture.js";
import { validSequence } from "./team-fixture.js";

// 위반 하나만 주입해 어느 팀원 검사가 발행을 막았는지 확인한다
const violations: Record<string, (claims: DraftText[]) => void> = {
  "근거 없음": (claims) => {
    claims[0].evidenceIds = [];
  },
  "숫자 불일치": (claims) => {
    const claim = claims.find((claim) => claim.claimType === "수치");
    if (!claim) throw new Error("수치 템플릿 없음");
    claim.text += " 1500명";
  },
  "구간에 확률": (claims) => {
    claims[0].text += " 90%";
  },
  "OOD 인용 없음": (claims) => {
    for (const claim of claims)
      claim.evidenceIds = claim.evidenceIds.filter(
        (id) => !id.endsWith("-ood"),
      );
  },
  "판정 문구 불일치": (claims) => {
    claims[0].text = "안전관리계획이 필요 없어요";
  },
};

describe("게이트 B 재작성", () => {
  // 첫 실패에서 문장이 노출되지 않고 새 id·새 revision의 재작성만 발행한다
  it.each(Object.entries(violations))(
    "%s를 막고 한 번 재작성한다",
    async (_name, change) => {
      // 고정 문장도 같은 게이트에서 검사하도록 생성 직후의 초안 훼손을 재현한다
      const run = explainer.run;
      let drafts = 0;
      const stub = vi
        .spyOn(explainer, "run")
        .mockImplementation(async (ctx) => {
          const result = await run(ctx);
          if (++drafts === 1) change(result.value.claims);
          return result;
        });
      const harness = explanationFixture({
        forecast: (forecast) => oodForecast(forecast),
      });
      const sessionId = await harness.prepare();
      const events = await harness.message(sessionId);
      validSequence(events);
      // OOD 재작성의 실제 사실 요청도 선택한 실행에서만 외부 SHACL 검사로 넘긴다
      if (process.env.T304_OOD_FACTS_OUT && _name === "OOD 인용 없음")
        writeFileSync(
          process.env.T304_OOD_FACTS_OUT,
          JSON.stringify({
            sessionId,
            facts: harness.calls
              .filter((call) => call.url.pathname.endsWith("/facts"))
              .map((call) => call.body),
          }),
        );
      const gates = events
        .filter((event) => event.event === "gate")
        .map((event) => event.data as GateReport);
      expect(gates.map((gate) => [gate.gate, gate.passed])).toEqual([
        ["A", true],
        ["B", false],
        ["B", true],
        ["publish", true],
      ]);
      expect(harness.attempts()).toBe(2);
      expect(gates.at(-1)?.revision).toBe(gates.at(-2)?.revision);
      const failedIds = gates[1].violations.map((item) => item.nodeId);
      expect(
        events
          .filter((event) => event.event === "claim")
          .some((event) => failedIds.includes((event.data as Claim).id)),
      ).toBe(false);
      stub.mockRestore();
    },
  );

  // 두 해설 모두 실패하면 템플릿만 새 draft로 적재하고 다시 검증한다
  it("두 번 실패 뒤 템플릿 검증 성공이면 발행한다", async () => {
    // LLM 초안과 재작성(템플릿이 아닌 결과)만 수치 문장을 훼손해 두 번 모두 실패시킨다
    const run = explainer.run;
    const stub = vi.spyOn(explainer, "run").mockImplementation(async (ctx) => {
      const result = await run(ctx);
      if (!result.value.template)
        violations["숫자 불일치"](result.value.claims);
      return result;
    });
    const harness = explanationFixture();
    const events = await harness.message(await harness.prepare());
    stub.mockRestore();
    validSequence(events);
    expect(
      events
        .filter((event) => event.event === "gate")
        .map((event) => [
          (event.data as GateReport).gate,
          (event.data as GateReport).passed,
        ]),
    ).toEqual([
      ["A", true],
      ["B", false],
      ["B", false],
      ["B", true],
      ["publish", true],
    ]);
    expect(harness.attempts()).toBe(2);
    expect(JSON.stringify(events)).toContain("템플릿 설명");
  });

  // 템플릿조차 승인되지 않으면 실패 B는 최대 두 번만 보내고 done id를 비운다
  it("두 번 실패와 템플릿 실패는 발행을 중단한다", async () => {
    const harness = explanationFixture({
      override: async ({ url }) => {
        if (
          !url.pathname.endsWith("/validate") ||
          !url.searchParams.get("shapes")?.includes("S01")
        )
          return;
        return Response.json({
          gate: "B",
          passed: false,
          revision: Number(url.searchParams.get("revision")),
          masterVersion: 7,
          violations: [
            {
              check: "shacl",
              shapeId: "S11",
              nodeId: "c-yeongjong",
              message: "작성 단계 확인 실패",
            },
          ],
        });
      },
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(
      events.filter(
        (event) =>
          event.event === "gate" && (event.data as GateReport).gate === "B",
      ),
    ).toHaveLength(2);
    expect(
      harness.calls.filter((call) => call.url.pathname.endsWith("/validate")),
    ).toHaveLength(4);
    expect(
      events.filter((event) =>
        ["claim", "evidence", "suggest"].includes(event.event),
      ),
    ).toEqual([]);
    expect(events.slice(-2)).toMatchObject([
      {
        event: "error",
        data: {
          code: "SERVICE_UNAVAILABLE",
          message: "설명 문장을 검증하지 못했어요",
        },
      },
      { event: "done", data: { forecastId: null } },
    ]);
    expect(
      harness.calls.some((call) => call.url.pathname.endsWith("/publish")),
    ).toBe(false);
  });

  // OOD 근거가 없는 실서비스 응답을 게이트웨이가 새 근거로 꾸미지 않는다
  it("OOD 검사 근거가 없으면 템플릿도 발행하지 않는다", async () => {
    const harness = explanationFixture({
      forecast: (forecast) => oodForecast(forecast, false),
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(events.at(-1)).toMatchObject({ data: { forecastId: null } });
    expect(
      harness.calls.some((call) => call.url.pathname.endsWith("/publish")),
    ).toBe(false);
    expect(
      harness.calls.filter(
        (call) =>
          call.url.pathname.endsWith("/facts") &&
          (call.body as { schema: string }).schema === "claim",
      ),
    ).toEqual([]);
  });

  // 지나간 B와 다른 버전의 성공 응답도 문장 공개를 허용하지 않는다
  it.each(["revision", "masterVersion"])(
    "발행 %s 불일치는 거부한다",
    async (field) => {
      const harness = explanationFixture({
        override: async ({ url }) => {
          if (!url.pathname.endsWith("/publish")) return;
          return Response.json({
            gate: "publish",
            passed: true,
            revision: Number(url.searchParams.get("revision")),
            masterVersion: 7,
            violations: [],
            [field]: 99,
          });
        },
      });
      const events = await harness.message(await harness.prepare());
      validSequence(events);
      expect(events.some((event) => event.event === "claim")).toBe(false);
      expect(events.at(-1)).toMatchObject({ data: { forecastId: null } });
    },
  );
});
