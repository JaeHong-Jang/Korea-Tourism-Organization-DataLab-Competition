// 게이트 A의 병렬 검증팀 기록과 모양별 차단을 실제 SSE 스트림으로 검증한다
import type {
  AgentStatus,
  AgentStep,
  ForecastCard,
  GateReport,
  SseEvent,
} from "@crowdcast/contracts/types";
import { describe, expect, it, vi } from "vitest";
import { ANALYSIS_SHAPES } from "../src/team/lead/gates.js";
import { analysisRuleCheck } from "../src/team/verification/rule-check.js";
import { analysisSkeptic } from "../src/team/verification/skeptic.js";
import { analysisSourceCheck } from "../src/team/verification/source-check.js";
import { teamFixture, validSequence } from "./team-fixture.js";

// 게이트 B의 같은 팀원 기록과 섞이지 않도록 게이트 A 앞의 검증 작업만 고른다
function analysisSteps(events: SseEvent[]): AgentStep[] {
  const gateIndex = events.findIndex(
    (event) =>
      event.event === "gate" && (event.data as GateReport).gate === "A",
  );
  expect(gateIndex).toBeGreaterThan(0);
  return events
    .slice(0, gateIndex)
    .filter((event) => event.event === "agent_step")
    .map((event) => event.data as AgentStep)
    .filter((step) => step.team === "verification");
}

describe("게이트 A 검증팀", () => {
  // 세 run이 모두 진입해야 풀리는 장벽으로 같은 실행기의 실제 병렬 배정을 확인한다
  it("한 검증 결과를 세 팀원이 병렬로 기록한 뒤 게이트 A를 보낸다", async () => {
    let release = () => {};
    const started: GateReport[] = [];
    const allStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    for (const agent of [
      analysisSourceCheck,
      analysisRuleCheck,
      analysisSkeptic,
    ]) {
      const run = agent.run;
      vi.spyOn(agent, "run").mockImplementation(async (ctx) => {
        started.push(ctx.input.gate);
        if (started.length === 3) release();
        await allStarted;
        return run(ctx);
      });
    }
    const harness = teamFixture();
    const id = await harness.prepare();
    const events = await harness.message(id);
    validSequence(events);
    const steps = analysisSteps(events);
    expect(steps.map((step) => step.agentId).sort()).toEqual([
      "rule-check",
      "skeptic",
      "source-check",
    ]);
    expect(started).toHaveLength(3);
    expect(started.every((gate) => gate === started[0])).toBe(true);
    expect(events.find((event) => event.event === "gate")?.data).toEqual(
      started[0],
    );
    const validations = harness.calls.filter(
      ({ url }) =>
        url.pathname.endsWith("/validate") &&
        url.searchParams.get("shapes") === ANALYSIS_SHAPES,
    );
    expect(validations).toHaveLength(1);
    expect(validations[0].url.searchParams.get("revision")).toBe("4");
    expect(validations[0].url.searchParams.get("masterVersion")).toBe("7");

    // 중복 근거는 한 번만 기록하고 평시·사례·예보에서 검사한 근거 id를 함께 보존한다
    const forecast = events.find((event) => event.event === "forecast")
      ?.data as ForecastCard;
    const modelEvidence = `ev-model-${forecast.id}`;
    const evidenceByAgent = {
      "source-check": [
        "ev-baseline-28110",
        modelEvidence,
        "ev-case-e-yeongjong-2024",
      ],
      "rule-check": ["ev-rule-legal-hazard", "ev-rule-internal-5000"],
      skeptic: [
        "ev-baseline-28110",
        modelEvidence,
        "ev-as-peak-day-factor",
        "ev-as-concurrency-fireworks",
      ],
    };
    for (const step of steps) {
      expect(step).toMatchObject({
        status: "done",
        usedLlm: false,
        model: null,
        outputClaimIds: [],
      });
      expect(step.outputEvidenceIds).toEqual(
        evidenceByAgent[step.agentId as keyof typeof evidenceByAgent],
      );
      expect(
        events
          .filter(
            (event) =>
              event.event === "agent_status" &&
              (event.data as AgentStatus).stepId === step.stepId,
          )
          .map((event) => event.data),
      ).toMatchObject([
        { agentId: step.agentId, team: "verification", state: "working" },
        {
          agentId: step.agentId,
          team: "verification",
          state: "done",
          note: step.note,
        },
      ]);
    }

    // 추가된 단계가 작업 조회와 JSONL에도 남고 게이트 B의 기존 네 검사도 계속 실행된다
    const stored: AgentStep[] = await (
      await harness.app.request(`/api/team/sessions/${id}/steps`)
    ).json();
    const traced = harness
      .trace(id)
      .filter((row) => row.event === "agent_step")
      .map((row) => row.data);
    expect(stored).toEqual(expect.arrayContaining(steps));
    expect(traced).toEqual(expect.arrayContaining(steps));
    const gateA = events.findIndex((event) => event.event === "gate");
    const gateB = events.findIndex(
      (event) =>
        event.event === "gate" && (event.data as GateReport).gate === "B",
    );
    expect(
      events
        .slice(gateA + 1, gateB)
        .filter((event) => event.event === "agent_step")
        .map((event) => event.data as AgentStep)
        .filter((step) => step.team === "verification")
        .map((step) => step.agentId)
        .sort(),
    ).toEqual(["number-check", "rule-check", "skeptic", "source-check"]);
  });

  // 각 모양은 담당 팀원만 막고 여러 위반도 원문 대신 모양 id와 건수로 요약한다
  it.each([
    { shapes: ["S03"], agentId: "source-check" },
    { shapes: ["S04"], agentId: "source-check" },
    { shapes: ["S08"], agentId: "source-check" },
    { shapes: ["S05"], agentId: "rule-check" },
    { shapes: ["S06"], agentId: "rule-check" },
    { shapes: ["S07"], agentId: "skeptic" },
    { shapes: ["S09"], agentId: "skeptic" },
    { shapes: ["S05", "S05", "S06"], agentId: "rule-check" },
  ])(
    "$shapes 위반은 $agentId를 blocked로 기록하고 숫자를 차단한다",
    async ({ shapes, agentId }) => {
      const gate: GateReport = {
        gate: "A",
        passed: false,
        revision: 4,
        masterVersion: 7,
        violations: shapes.map((shapeId) => ({
          check: "shacl",
          shapeId,
          nodeId: "j-yeongjong-2025",
          message: "민감한 위반 원문과 내부 경로",
        })),
      };
      const harness = teamFixture({
        override: async ({ url }) => {
          if (url.pathname.endsWith("/validate")) return Response.json(gate);
        },
      });
      const events = await harness.message(await harness.prepare());
      validSequence(events);
      const steps = analysisSteps(events);
      expect(steps).toHaveLength(3);
      expect(steps.filter((step) => step.status === "blocked")).toMatchObject([
        {
          agentId,
          note: `${[...new Set(shapes)].join("·")} 위반 ${shapes.length}건을 찾았어요.`,
        },
      ]);
      expect(steps.filter((step) => step.status === "done")).toHaveLength(2);
      const blocked = steps.find((step) => step.agentId === agentId);
      expect(blocked?.outputEvidenceIds.length).toBeGreaterThan(0);
      expect(events).toContainEqual(
        expect.objectContaining({
          event: "agent_status",
          data: expect.objectContaining({
            agentId,
            stepId: blocked?.stepId,
            state: "blocked",
            note: blocked?.note,
          }),
        }),
      );

      // 원래 게이트·오류 응답은 유지하고 작업 말풍선에는 서비스 위반 원문을 복사하지 않는다
      expect(events.slice(-3)).toMatchObject([
        { event: "gate", data: gate },
        { event: "error", data: { code: "ANALYSIS_GATE_FAILED" } },
        { event: "done", data: { forecastId: null } },
      ]);
      expect(
        events.some((event) =>
          ["forecast", "claim", "evidence"].includes(event.event),
        ),
      ).toBe(false);
      expect(
        JSON.stringify(
          events.filter((event) =>
            ["agent_status", "agent_step"].includes(event.event),
          ),
        ),
      ).not.toContain("민감한 위반 원문과 내부 경로");
      expect(
        harness.calls.filter(({ url }) => url.pathname.endsWith("/validate")),
      ).toHaveLength(1);
    },
  );
});
