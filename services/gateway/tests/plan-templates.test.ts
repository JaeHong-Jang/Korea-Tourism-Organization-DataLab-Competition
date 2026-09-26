// 섹션 배치·검토 이유·숫자 잠금이 최초 스냅샷의 원문과 계약 순서를 지키는지 검사한다
import planSectionSchema from "@crowdcast/contracts/schemas/plan-section.schema.json";
import type { Claim, ForecastReport } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { planSections } from "../src/team/report/plan-templates.js";
import {
  MODEL_NOTICE,
  REVIEW_NOTICE,
} from "../src/team/verification/skeptic.js";
import { report as snapshot } from "./proxy-fixture.js";

// 독립적인 섹션 배치 입력을 기존 계약의 한국 행사·발행 문장 구조에서 만든다
function reportWithTopics(): ForecastReport {
  const report = structuredClone(snapshot);
  const claim = (
    id: string,
    text: string,
    claimType: Claim["claimType"],
  ): Claim & { status: "published" } => ({
    ...structuredClone(report.claims[0]),
    id: `c-yeongjong-${id}`,
    text,
    rendered: text,
    claimType,
    evidenceIds: ["ev-rule-internal-5000"],
  });
  report.claims.push(
    claim("judgment", "교통·경찰·소방 사전 협의 권고", "판정"),
    claim("review", REVIEW_NOTICE, "설명"),
    claim("model", MODEL_NOTICE, "설명"),
    claim("routes", "대피 동선과 교통 통제를 함께 확인해요", "권고"),
    claim("traffic", "주차 안내와 화장실 위치를 확인해요", "권고"),
    claim("medical", "의료와 화장실 안내를 준비해요", "권고"),
    claim("fire", "폭죽 안전거리를 점검해요", "권고"),
    claim("factor", "토요일 저녁 개최라 늘어요", "요인"),
    claim("explanation", "비슷한 과거 행사 기록을 근거로 삼았어요", "설명"),
  );
  return report;
}

// 복합 키워드에도 한 문장을 한 섹션에만 두고 원문·id·순서를 그대로 쓴다
it("9개 섹션에 판정·고지·수치·주제 권고·위험 판정을 중복 없이 배치한다", () => {
  const report = reportWithTopics();
  report.claims.push(structuredClone(report.claims[0]));
  const before = structuredClone(report);
  const sections = planSections(report);
  expect(sections.map((section) => section.key)).toEqual(
    planSectionSchema.properties.key.enum,
  );
  expect(sections.map((section) => section.status)).toEqual([
    "작성됨",
    "검토 필요",
    "작성됨",
    "작성됨",
    "검토 필요",
    "작성됨",
    "작성됨",
    "검토 필요",
    "작성됨",
  ]);
  expect(sections[0].claimIds).toEqual([
    "c-yeongjong-judgment",
    "c-yeongjong-review",
    "c-yeongjong-model",
  ]);
  expect(sections[3].claimIds).toEqual(["c-yeongjong-routes"]);
  expect(sections[5].claimIds).toEqual(["c-yeongjong-traffic"]);
  expect(sections[6].claimIds).toEqual(["c-yeongjong-medical"]);
  expect(sections[8].claimIds).toEqual([
    report.claims[0].id,
    "c-yeongjong-fire",
  ]);
  const ids = sections.flatMap((section) => section.claimIds);
  expect(new Set(ids).size).toBe(ids.length);
  for (const section of sections) {
    expect(section.body).toBe(
      section.claimIds
        .map((id) => report.claims.find((claim) => claim.id === id)?.rendered)
        .join("\n"),
    );
    if (section.status === "검토 필요")
      expect(section.title).toMatch(/채워야 해요|확인해야 해요/);
  }
  expect(report).toEqual(before);
});

// 시간대 자료가 하나라도 빠지면 수치 문장은 보존하되 담당자 검토를 남긴다
it.each(["peakHours", "hourlyProfile", "both"])(
  "시간대 자료 %s 공백은 검토 필요",
  (missing) => {
    const report = reportWithTopics();
    if (missing !== "hourlyProfile") report.forecast.peakHours = null;
    if (missing !== "peakHours") report.forecast.hourlyProfile = [];
    const section = planSections(report)[2];
    expect(section.status).toBe("검토 필요");
    expect(section.body).toBe(report.claims[1].rendered);
    expect(section.title).toContain(
      "시간대별 분포 자료가 없어 담당자가 채워야 해요",
    );
    expect(section.lockedFields).toHaveLength(1);
  },
);

// 주제 자료가 없으면 빈 본문과 이유만 제공하고 인력·조직·날씨도 비워 둔다
it("권고가 없는 주제와 후속 범위 섹션은 검토 필요로 남는다", () => {
  const sections = planSections(snapshot);
  for (const index of [1, 3, 4, 5, 6, 7]) {
    expect(sections[index]).toMatchObject({
      status: "검토 필요",
      body: "",
      claimIds: [],
      lockedFields: [],
    });
    expect(sections[index].title).toContain(" — ");
  }
});

// 후보·타 세션·알 수 없는 근거는 섹션에 들어가지 않는다
it.each(["status", "session", "forecast", "evidence", "rendered"])(
  "발행 문장의 %s 조건이 틀리면 제외한다",
  (invalid) => {
    const report = reportWithTopics();
    const claim = report.claims.find(
      (item) => item.id === "c-yeongjong-routes",
    );
    if (!claim) throw new Error("동선 문장 없음");
    if (invalid === "status") Object.assign(claim, { status: "candidate" });
    if (invalid === "session") claim.sessionId = "s-sorae-2026";
    if (invalid === "forecast") claim.forecastId = "f-sorae-2026";
    if (invalid === "evidence") claim.evidenceIds = ["ev-missing"];
    if (invalid === "rendered") claim.rendered = null;
    expect(planSections(report)[3]).toMatchObject({
      status: "검토 필요",
      claimIds: [],
      body: "",
    });
  },
);

// 화면용 반올림이나 쉼표 대신 계약 canonical 값으로 수치 칸을 잠근다
it.each([21000, 2002.4768, -0])("수치 %s는 정규 표기로 잠근다", (value) => {
  const report = structuredClone(snapshot);
  report.forecast.peakConcurrent.p50 = value;
  report.claims[1].placeholders.push({
    ...report.claims[1].placeholders[0],
    name: "peak_again",
  });
  expect(planSections(report)[2].lockedFields).toEqual([
    {
      name: "p50",
      value: `${JSON.stringify(value)} 명`,
      quantityId: report.forecast.peakConcurrent.id,
    },
  ]);
});
