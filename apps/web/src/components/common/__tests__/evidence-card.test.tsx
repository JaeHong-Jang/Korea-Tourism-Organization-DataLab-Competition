// 여섯 근거 카드의 계약 유효성과 종류별 본문을 검증한다.
import type {
  Evidence,
  ForecastReport,
  SimilarEvent,
} from "@crowdcast/contracts/types";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import evidenceFixture from "../../../../../../packages/contracts/fixtures/evidence/valid-data.json";
import reportFixture from "../../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import similarFixture from "../../../../../../packages/contracts/fixtures/similar-event/valid-yeongjong-2024.json";
import commonSchema from "../../../../../../packages/contracts/schemas/common.schema.json";
import evidenceSchema from "../../../../../../packages/contracts/schemas/evidence.schema.json";
import { EvidenceCard } from "../evidence-card";

const report = reportFixture as unknown as ForecastReport;
const evidence = evidenceFixture as Evidence;
const similar = similarFixture as unknown as SimilarEvent;
const ajv = new Ajv2020();
addFormats(ajv);
ajv.addSchema(commonSchema);
const validEvidence = ajv.compile(evidenceSchema);

// 원본 계약 견본과 검증 근거를 카드의 읽기 순서로 살핀다.
describe("근거 카드", () => {
  // 여섯 종류의 유효한 계약 견본에서 필수 본문과 근거 번호를 확인한다.
  it("근거 카드 6종", () => {
    const model = report.evidence.find(
      (item) => item.kind === "model",
    ) as Evidence;
    const rule = report.evidence.find(
      (item) => item.kind === "rule",
    ) as Evidence;
    const assumption = report.evidence.find(
      (item) => item.kind === "assumption",
    ) as Evidence;
    const caseEvidence = similar.evidence[0] as Evidence;
    const check: Evidence = {
      ...model,
      id: "ev-check-demo",
      kind: "check",
      title: "숫자 검증",
      summary: "숫자와 근거를 대조했어요",
      modelVersion: null,
      checkResult: { checkKind: "number", passed: true, revision: 7 },
      availableAt: "2025-10-04",
    };
    const cases = [
      {
        item: evidence,
        context: { observation: report.forecast.observations[0] },
        expected: "메뉴",
      },
      {
        item: model,
        context: { predictionRun: report.forecast.predictionRun },
        expected: "학습 범위",
      },
      { item: rule, context: { ruleKind: "법정" as const }, expected: "조항" },
      { item: caseEvidence, context: { similar }, expected: "단위가 달라" },
      {
        item: assumption,
        context: { assumption: report.forecast.assumptions[0] },
        expected: "범위",
      },
      { item: check, context: {}, expected: "수정판 7" },
    ];
    for (const { item, context, expected } of cases) {
      expect(validEvidence(item), JSON.stringify(validEvidence.errors)).toBe(
        true,
      );
      const markup = renderToStaticMarkup(
        <EvidenceCard
          evidence={item}
          number={2}
          context={context}
          defaultOpen
        />,
      );
      expect(markup).toContain("근거 2");
      expect(markup).toContain(item.title);
      expect(markup).toContain(expected);
      if (item.kind === "assumption") expect(markup).toContain("0.8배");
    }
  });

  // 사례의 관측 수치가 추정이면 카드의 머리말에도 추정을 드러낸다.
  it("사례 추정 수치", () => {
    const markup = renderToStaticMarkup(
      <EvidenceCard
        evidence={similar.evidence[0]}
        number={1}
        context={{
          similar: {
            ...similar,
            measured: similar.measured && {
              ...similar.measured,
              estimated: true,
            },
          },
        }}
        defaultOpen
      />,
    );
    expect(markup).toContain("실측 추정");
  });
});
