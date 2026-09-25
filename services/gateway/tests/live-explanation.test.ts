// 소래포구 실예보 응답으로 입력 크기와 참고용 인용·수치 서식을 회귀 검증한다
import { readFileSync } from "node:fs";
import type { Forecast } from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import { explanationInput } from "../src/llm/explanation-prompt.js";
import { templateClaims } from "../src/team/report/templates.js";
import { checkNumbers } from "../src/team/verification/number-check.js";
import { matchesRule } from "../src/team/verification/rule-check.js";
import {
  hasModelNotice,
  hasReviewCitation,
  REVIEW_NOTICE,
  reviewEvidence,
} from "../src/team/verification/skeptic.js";
import { reportForecast } from "./report-fixture.js";

// 공유 캐시는 읽기만 하고 저장된 실제 응답 사본을 테스트마다 분리한다
function soraeForecast(): Forecast {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/services/forecast-live-sorae.json", import.meta.url),
      "utf8",
    ),
  );
}

describe("실예보 설명 회귀", () => {
  // 근거 원문·관측·규칙 문구·수치는 모델 컨텍스트로 보내지 않고 요인만 보낸다
  it("근거 20개의 실제 해설 입력은 4,000자 이하이다", () => {
    const forecast = soraeForecast();
    const input = explanationInput(forecast, []);
    expect(forecast.evidence).toHaveLength(20);
    expect(input.length).toBeLessThanOrEqual(4_000);
    const parsed = JSON.parse(input);
    expect(parsed.basis).toBe(forecast.judgment.basis);
    expect(parsed.factors).toEqual([]);
    expect(parsed).not.toHaveProperty("evidence");
    expect(parsed).not.toHaveProperty("quantities");
    expect(parsed).not.toHaveProperty("templates");
    const violations = Array.from(
      { length: 50 },
      () => "S10: uncertainty 문장 검사에 실패했어요.",
    );
    expect(explanationInput(forecast, violations).length).toBeLessThanOrEqual(
      4_000,
    );
  });

  // 실제 check 근거는 제목이 고지이고 요약은 OOD 사유 JSON이다
  it("실제 참고용 근거로 템플릿의 숫자·규칙·인용을 검사한다", () => {
    const forecast = soraeForecast();
    const evidence = reviewEvidence(forecast);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].summary).not.toContain(REVIEW_NOTICE);
    expect(evidence[0].checkResult).toEqual({
      checkKind: "ood",
      passed: true,
      revision: 0,
    });
    const claims = templateClaims(forecast, "s-sorae");
    expect(hasModelNotice(claims, forecast)).toBe(true);
    expect(
      claims.some(
        (claim) =>
          claim.text === REVIEW_NOTICE &&
          claim.evidenceIds.includes(evidence[0].id),
      ),
    ).toBe(true);
    for (const claim of claims) {
      expect(claim.evidenceIds.length).toBeGreaterThan(0);
      expect(hasReviewCitation(claim, forecast)).toBe(true);
      expect(matchesRule(claim, forecast)).toBe(true);
      expect(checkNumbers(claim, forecast).passed).toBe(true);
    }
    const numeric = claims.find((claim) => claim.claimType === "수치");
    if (!numeric) throw new Error("수치 문장 없음");
    expect(checkNumbers(numeric, forecast).rendered).toContain(
      "2,002~12,417명 추정",
    );
  });

  // 제목이 같아도 실패한 검사·다른 예보·다른 검사 종류는 S10 근거가 아니다
  it.each(["title", "forecastId", "passed", "checkKind"])(
    "참고용 근거의 %s 오류는 거부한다",
    (field) => {
      const forecast = soraeForecast();
      const evidence = reviewEvidence(forecast)[0];
      if (!evidence.checkResult) throw new Error("검사 결과 없음");
      if (field === "title") evidence.title = "학습 범위 확인";
      if (field === "forecastId") evidence.forecastId = "f-other";
      if (field === "passed") evidence.checkResult.passed = false;
      if (field === "checkKind") evidence.checkResult.checkKind = "rule";
      expect(reviewEvidence(forecast)).toEqual([]);
    },
  );

  // 기여도 크기로 상위 세 요인만 골라 이름·방향·근거만 전달한다
  it("요인은 상위 세 개로 압축한다", () => {
    const forecast = reportForecast();
    const factor = forecast.factors[0];
    // 라벨의 숫자 조각은 문장에서 빠지므로 이름은 숫자 없는 글자로 둔다
    const names: Record<number, string> = {
      1: "가",
      4: "라",
      2: "나",
      [-3]: "다",
    };
    forecast.factors = [1, 4, 2, -3].map((contribution) => ({
      ...factor,
      contribution,
      label: `요인 ${names[contribution]}`,
    }));
    expect(JSON.parse(explanationInput(forecast, [])).factors).toEqual(
      [4, -3, 2].map((value) => ({
        name: `요인 ${names[value]}`,
        direction: factor.direction,
        evidenceIds: factor.evidenceIds,
      })),
    );
  });
});
