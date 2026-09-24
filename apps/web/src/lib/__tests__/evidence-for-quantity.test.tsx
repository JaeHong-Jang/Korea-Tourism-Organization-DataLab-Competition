// 계약 예보서의 발행 문장에서만 수치 근거를 찾는지 확인한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import reportFixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { KeyNumber } from "../../components/common/key-number";
import { evidenceForQuantity } from "../evidence-for-quantity";

const report = reportFixture as unknown as ForecastReport;

// 숫자가 가리키는 인용 문장의 두 근거를 순서대로 보여 준다.
describe("수치 근거 연결", () => {
  // 발행 문장의 순서가 카드와 칩에 같은 근거 순서로 남는지 확인한다.
  it("순간 최대에 모델과 동시체류율을 연결한다", () => {
    const linked = evidenceForQuantity(
      report.claims,
      report.evidence,
      report.card.peakConcurrent.id,
    );
    expect(linked.map((item) => item.id)).toEqual([
      "ev-model-f-yeongjong-2025",
      "ev-as-concurrency-fireworks",
    ]);
    const markup = renderToStaticMarkup(
      <KeyNumber
        quantity={report.card.peakConcurrent}
        claims={report.claims}
        evidence={report.evidence}
        evidenceOrder={report.evidence}
      />,
    );
    expect(markup).toContain("ev-model-f-yeongjong-2025");
    expect(markup).toContain("ev-as-concurrency-fireworks");
    expect(markup).toContain("가정: 동시체류율(불꽃)");
    expect(markup).toContain('aria-description="불꽃 행사 동시체류율');
    expect(markup).not.toContain("ev-baseline-28110");
  });

  // 번호표를 따로 받지 않아도 연결된 두 근거에 서로 다른 번호를 준다.
  it("번호표를 생략하면 문장 근거 순서로 번호를 붙인다", () => {
    const markup = renderToStaticMarkup(
      <KeyNumber
        quantity={report.card.peakConcurrent}
        claims={report.claims}
        evidence={report.evidence}
      />,
    );
    expect(markup).toContain("근거 1, 모델");
    expect(markup).toContain("근거 2, 가정");
    expect(markup).not.toContain("근거 1, 가정");
    expect(markup.match(/class="evidence-chip"/g)).toHaveLength(2);
    expect(markup).not.toContain("source-tip");
  });

  // 수치를 인용한 발행 문장이 없으면 임의 근거 칩을 만들지 않는다.
  it("인용 없는 수치에는 칩이 없다", () => {
    const quantity = { ...report.card.peakConcurrent, id: "q-unquoted" };
    expect(
      evidenceForQuantity(report.claims, report.evidence, quantity.id),
    ).toEqual([]);
    const markup = renderToStaticMarkup(
      <KeyNumber
        quantity={quantity}
        claims={report.claims}
        evidence={report.evidence}
      />,
    );
    expect(markup).not.toContain("evidence-chip");
  });
});
