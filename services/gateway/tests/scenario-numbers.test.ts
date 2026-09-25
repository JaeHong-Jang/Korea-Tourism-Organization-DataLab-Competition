// 렌더 숫자와 인용 규칙의 예외를 생산 코드 없이 만든 위반 사례로 검산한다
import { readFileSync } from "node:fs";
import type {
  Claim,
  Evidence,
  ForecastCard,
  ForecastReport,
} from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import { auditClaimNumbers } from "../evals/scenario-numbers.js";

// 계약 예보서의 문장·카드 모양을 복제해 고정된 소수·단위 검산 입력을 만든다
function numericCase() {
  const report: ForecastReport = JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const card: ForecastCard = JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/contracts/fixtures/forecast-card/valid-yeongjong.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const claim = structuredClone(report.claims[0]) as Claim;
  card.peakConcurrent.p10 = 2002.5;
  card.peakConcurrent.p90 = 12416.9;
  claim.text = "순간 최대 {{low}}~{{high}}명 추정";
  claim.rendered = "순간 최대 2,003~12,417명 추정";
  claim.placeholders = [
    { name: "low", quantityId: card.peakConcurrent.id, field: "p10" },
    { name: "high", quantityId: card.peakConcurrent.id, field: "p90" },
  ];
  const evidence = report.evidence.find((item) =>
    item.quantityIds.includes(card.peakConcurrent.id),
  );
  if (!evidence) throw new Error("Quantity 근거 픽스처 없음");
  claim.evidenceIds = [evidence.id];
  return { claim, card, evidence: [evidence] };
}

describe("독립 숫자 검산", () => {
  it("소수 인원을 독립 반올림하고 쉼표와 구간 공유 단위를 처리한다", () => {
    const { claim, card, evidence } = numericCase();
    expect(auditClaimNumbers(claim, card, evidence)).toEqual({
      problems: [],
      numericTokens: 2,
    });
  });

  it.each([
    "순간 최대 2,003~12,418명 추정",
    "순간 최대 2003~12417원 추정",
    "순간 최대 ２,００３~１２,４１７명 추정",
    "순간 최대 2,003~12,417명 추정 7",
  ])("렌더 변조를 거부한다: %s", (rendered) => {
    const { claim, card, evidence } = numericCase();
    claim.rendered = rendered;
    expect(
      auditClaimNumbers(claim, card, evidence).problems.length,
    ).toBeGreaterThan(0);
  });

  it("숫자가 카드에 있어도 Quantity 근거 참조가 없으면 거부한다", () => {
    const { claim, card, evidence } = numericCase();
    evidence[0].quantityIds = [];
    expect(auditClaimNumbers(claim, card, evidence).problems.join()).toContain(
      "근거 연결",
    );
  });

  it("다른 분위수 바인딩·중복 바인딩·쓰지 않은 바인딩을 거부한다", () => {
    const { claim, card, evidence } = numericCase();
    claim.placeholders[0].field = "p90";
    claim.placeholders.push(
      { ...claim.placeholders[0] },
      { ...claim.placeholders[0], name: "unused" },
    );
    expect(auditClaimNumbers(claim, card, evidence).problems).toHaveLength(2);
  });

  it("규칙의 완전한 인용만 허용하고 입력 JSON·부분 숫자는 예외로 보지 않는다", () => {
    const { claim, card, evidence } = numericCase();
    const rule: Evidence = {
      ...evidence[0],
      id: "ev-rule-threshold",
      kind: "rule",
      ruleId: "rule-legal-1000",
      summary: '법정 기준 — 순간 최대 1,000명 기준 입력: {"count":9999}',
    };
    claim.text = "순간 최대 1,000명 기준";
    claim.rendered = claim.text;
    claim.placeholders = [];
    claim.evidenceIds = [rule.id];
    expect(auditClaimNumbers(claim, card, [rule]).problems).toEqual([]);
    for (const text of ["9999", "1,000", "순간 최대 9,999명 기준"]) {
      claim.text = text;
      claim.rendered = text;
      expect(
        auditClaimNumbers(claim, card, [rule]).problems.length,
      ).toBeGreaterThan(0);
    }
  });
});
