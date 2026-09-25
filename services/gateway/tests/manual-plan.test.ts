// 매뉴얼 권고가 게이트 B를 거쳐 원래 발행 id로 인력·조직·동선 섹션에 배치되는지 검증한다
import { writeFileSync } from "node:fs";
import type {
  Claim,
  ForecastReport,
  GateReport,
} from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { planSections } from "../src/team/report/plan-templates.js";
import { manualRules, withManualChecks } from "./manual-plan-fixture.js";
import { report as snapshot } from "./proxy-fixture.js";
import { explanationFixture } from "./report-fixture.js";
import { validSequence } from "./team-fixture.js";

// 실제 예보팀의 출처·숫자·규칙 검사를 통과한 문장만 최초 스냅샷에서 계획에 넣는다
it("매뉴얼 여섯 권고를 검증·발행하고 해당 섹션을 작성됨으로 채운다", async () => {
  const harness = explanationFixture({ forecast: withManualChecks });
  const sessionId = await harness.prepare();
  const events = await harness.message(sessionId);
  validSequence(events);
  const gates = events
    .filter((event) => event.event === "gate")
    .map((event) => event.data as GateReport);
  expect(gates.map(({ gate, passed }) => [gate, passed])).toEqual([
    ["A", true],
    ["B", true],
    ["publish", true],
  ]);
  const report = harness.calls.find((call) =>
    call.url.pathname.endsWith("/snapshots"),
  )?.body as ForecastReport;
  expect(report).toBeDefined();
  const sections = planSections(report);
  const targets = [
    "staffing",
    "staffing",
    "staffing",
    "organization",
    "organization",
    "routes-evacuation",
  ];
  for (const [index, ruleId] of manualRules.entries()) {
    const item = report.forecast.judgment.checklist.find(
      (entry) => entry.ruleId === ruleId,
    );
    const claim = report.claims.find((entry) => entry.text === item?.text);
    expect(claim).toMatchObject({
      status: "published",
      claimType: "권고",
      text: item?.text,
      rendered: item?.text,
      placeholders: [],
    });
    expect(claim?.text).not.toMatch(/\d/);
    expect(claim?.evidenceIds).toEqual(
      expect.arrayContaining(item?.evidenceIds ?? []),
    );
    expect(claim?.checks.every((check) => check.passed)).toBe(true);
    expect(claim?.checks.map((check) => check.checkKind)).toEqual(
      expect.arrayContaining(["evidence", "number", "rule"]),
    );
    const assigned = sections.filter((section) =>
      section.claimIds.includes((claim as Claim).id),
    );
    expect(assigned).toHaveLength(1);
    expect(assigned[0].key).toBe(targets[index]);
    expect(assigned[0].status).toBe("작성됨");
    expect(assigned[0].title).not.toContain(" — ");
    expect(assigned[0].body).toContain(item?.text);
  }

  // 주차장·차량 이동로가 들어간 권고도 교통이 아닌 인력 섹션에만 남는다
  const staff = sections.find((section) => section.key === "staffing");
  expect(staff?.claimIds).toHaveLength(3);
  expect(staff?.body).toContain("출입구·주차장·차량 이동로·종료 시 출구");
  expect(staff?.lockedFields).toEqual([]);
  expect(
    sections.find((section) => section.key === "organization")?.claimIds,
  ).toHaveLength(2);
  for (const section of sections)
    expect(section.body).toBe(
      section.claimIds
        .map((id) => report.claims.find((claim) => claim.id === id)?.rendered)
        .join("\n"),
    );

  // 선택한 실행의 실제 적재 요청은 메모리 knowledge의 SHACL 재검증에 그대로 넘긴다
  if (process.env.T306B_FACTS_OUT)
    writeFileSync(
      process.env.T306B_FACTS_OUT,
      JSON.stringify({
        sessionId,
        facts: harness.calls
          .filter((call) => call.url.pathname.endsWith("/facts"))
          .map((call) => call.body),
      }),
    );
});

// 같은 문구라도 근거가 체크리스트 항목에 연결되지 않으면 규칙 우선 배치를 적용하지 않는다
it("인력 문구의 근거 연결이 없으면 기존 키워드 배치를 따른다", () => {
  const report = structuredClone(snapshot);
  withManualChecks(report.forecast);
  report.evidence = report.forecast.evidence;
  const item = report.forecast.judgment.checklist.find(
    (entry) => entry.ruleId === "rule-check-staff-focus",
  );
  if (!item) throw new Error("집중 배치 권고 없음");
  const claim = {
    ...report.claims[0],
    id: "c-yeongjong-staff-focus",
    claimType: "권고" as const,
    text: item.text,
    rendered: item.text,
    evidenceIds: ["ev-rule-internal-5000"],
  };
  report.claims = [claim];
  const sections = planSections(report);
  expect(sections.find((section) => section.key === "staffing")).toMatchObject({
    status: "검토 필요",
    claimIds: [],
    body: "",
  });
  expect(
    sections.find((section) => section.key === "traffic-parking")?.claimIds,
  ).toEqual([claim.id]);
});
