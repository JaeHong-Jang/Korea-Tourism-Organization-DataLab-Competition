// 새 예보의 실제 스트림·되묻기 재개·작업 기록을 계약 순서 규칙으로 검증한다

// @ts-expect-error 계약의 카드 투영 실행기는 JavaScript로 배포된다
import { projectCard } from "@crowdcast/contracts/rules/card-projection.mjs";
import type { AgentStep, GateReport } from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import { contractRegistry } from "../src/contract/registry.js";
import { ANALYSIS_SHAPES } from "../src/team/lead/gates.js";
import {
  answer,
  fullText,
  teamFixture,
  validSequence,
} from "./team-fixture.js";

describe("새 예보 스트림", () => {
  // 가짜 서비스라도 실제 요청·참조 적재·검증 범위와 카드 투영을 모두 거친다
  it("분석팀과 게이트 A 뒤 숫자를 보내고 발행 뒤 문장을 보낸다", async () => {
    const harness = teamFixture();
    const id = await harness.prepare();
    const events = await harness.message(id);
    validSequence(events);
    const facts = harness.calls
      .filter((call) => call.url.pathname.endsWith("/facts"))
      .map((call) => call.body as { schema: string; items: unknown[] });
    expect(facts[0].schema).toBe("event");
    expect(
      facts
        .slice(1, 3)
        .map((body) => body.schema)
        .sort(),
    ).toEqual(["region-baseline", "similar-event"]);
    const forecastFact = facts.find((fact) => fact.schema === "forecast");
    expect(forecastFact).toBeDefined();
    expect(events.find((event) => event.event === "forecast")?.data).toEqual(
      projectCard(forecastFact?.items[0]),
    );
    expect(
      events
        .slice(
          0,
          events.findIndex(
            (event) =>
              event.event === "gate" &&
              (event.data as GateReport).gate === "publish",
          ),
        )
        .filter((event) =>
          ["claim", "evidence", "suggest"].includes(event.event),
        ),
    ).toEqual([]);
    const gate = events.find((event) => event.event === "gate");
    expect(gate?.data).toMatchObject({
      gate: "A",
      passed: true,
      revision: 4,
      masterVersion: 7,
    });
    const validation = harness.calls.find((call) =>
      call.url.pathname.endsWith("/validate"),
    );
    expect(validation?.url.searchParams.get("shapes")).toBe(ANALYSIS_SHAPES);
    expect(validation?.url.searchParams.get("shapes")).toBe(
      "S03,S04,S05,S06,S07,S08,S09",
    );
    expect(
      harness.calls
        .find((call) => call.url.pathname === "/v1/baseline")
        ?.url.searchParams.get("before"),
    ).toBe("2026-09-25");
    expect(
      harness.calls.some(
        (call) =>
          call.url.port === "8030" || call.url.pathname.endsWith("/publish"),
      ),
    ).toBe(true);

    // API 기록과 JSONL 기록은 스트림의 실제 작업 결과와 같아야 한다
    const response = await harness.app.request(
      `/api/team/sessions/${id}/steps`,
    );
    const steps: AgentStep[] = await response.json();
    const validate = contractRegistry.getSchema(
      "https://crowdcast.local/schemas/agent-step.schema.json",
    );
    expect(steps.map((step) => step.agentId).sort()).toEqual([
      "archivist",
      "briefer",
      "card-maker",
      "dictation",
      "dictation",
      "explainer",
      "forecaster",
      "lead",
      "lead",
      "local-guide",
      "number-check",
      "rule-check",
      "rule-check",
      "skeptic",
      "skeptic",
      "source-check",
      "source-check",
    ]);
    for (const step of steps) {
      expect(validate?.(step)).toBe(true);
      expect(step).toMatchObject({
        usedLlm: false,
        model: null,
      });
      expect(step.ms).toBeGreaterThanOrEqual(0);
    }
    expect(steps.filter((step) => step.status !== "done")).toMatchObject([
      { agentId: "dictation", status: "blocked" },
    ]);
    expect(
      steps.find((step) => step.agentId === "forecaster")?.outputEvidenceIds
        .length,
    ).toBeGreaterThan(0);
    const trace = harness.trace(id);
    for (const row of trace) {
      expect(row.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(row.at).toISOString()).toBe(row.at);
    }
    expect(
      trace
        .filter((row) => row.requestId === trace.at(-1).requestId)
        .map(({ requestId: _requestId, at: _at, ...event }) => event),
    ).toEqual(events);
    expect(JSON.stringify(harness.trace(id))).not.toContain(fullText);
  });

  // fake는 명시한 경우에만 실제 forecast 주소 대신 픽스처를 사용한다
  it("FORECAST_MODE=fake를 명시하면 계약 픽스처를 사용한다", async () => {
    const harness = teamFixture({ env: { FORECAST_MODE: "fake" } });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(events.some((event) => event.event === "forecast")).toBe(true);
    expect(harness.calls.some((call) => call.url.port === "8010")).toBe(false);
    expect(JSON.stringify(events)).toContain("계약 예시");
  });

  // 필수값 답변으로 불꽃 유형을 확인하면 위험 질문을 추가하고 다음 답에서 확정한다
  it("필수값 누락이면 ask 뒤 done, answer로 재개한다", async () => {
    const harness = teamFixture();
    const id = await harness.create();
    const initial = await harness.message(id, {
      text: "영종에서 축제를 열어요.",
    });
    validSequence(initial);
    expect(initial.some((event) => event.event === "ask")).toBe(true);
    expect(harness.calls).toEqual([]);
    const resumed = await harness.message(id, {
      text: "행사 정보 확인",
      answer,
    });
    validSequence(resumed);
    expect(resumed.filter((event) => event.event === "ask")).toMatchObject([
      { data: { field: "hazards" } },
    ]);
    const confirmed = await harness.message(id);
    validSequence(confirmed);
    expect(confirmed.some((event) => event.event === "forecast")).toBe(true);
    expect(new Set(harness.trace(id).map((row) => row.requestId)).size).toBe(3);
  });

  // 구조화된 답변은 한 번에 하나씩 와도 이미 확인한 초안을 잃지 않는다
  it("부분 답변 뒤 남은 필수값만 다시 묻는다", async () => {
    const harness = teamFixture();
    const id = await harness.create();
    await harness.message(id, { text: "영종 불꽃축제" });
    const events = await harness.message(id, {
      text: "",
      answer: { name: answer.name, type: answer.type },
    });
    validSequence(events);
    expect(
      events
        .filter((event) => event.event === "ask")
        .map((event) => (event.data as { field: string }).field),
    ).not.toContain("name");
    expect(events.some((event) => event.event === "forecast")).toBe(false);
    expect(harness.calls).toEqual([]);
  });

  // 묻지 않은 answer는 적용하지 않고 새 예보 모드에서 조건을 확인한다
  it("발행 완료 세션의 모호한 날짜 변경은 선택 질문을 보낸다", async () => {
    const harness = teamFixture();
    const id = await harness.prepare();
    const published = await harness.message(id);
    const done = published.at(-1)?.data as { forecastId: string };
    expect(done.forecastId).toEqual(expect.any(String));
    const count = harness.calls.length;
    const events = await harness.message(id, {
      text: "날짜 변경",
      answer: { startsAt: "2026-10-19T19:00:00+09:00" },
    });
    validSequence(events);
    expect(events.at(-2)).toMatchObject({
      event: "ask",
      data: {
        field: "startsAt",
      },
    });
    expect(harness.calls).toHaveLength(count);
  });
});
