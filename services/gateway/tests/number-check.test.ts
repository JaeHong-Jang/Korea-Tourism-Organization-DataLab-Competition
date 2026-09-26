// 규칙 상수 예외와 Quantity 렌더링의 숫자·단위 경계를 검증한다
import type { Claim } from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import { formatQuantity } from "../src/team/report/quantity-format.js";
import { templateClaims } from "../src/team/report/templates.js";
import { checkNumbers } from "../src/team/verification/number-check.js";
import { matchesRule } from "../src/team/verification/rule-check.js";
import { reportForecast } from "./report-fixture.js";

// 순간 최대 문장은 실예측 대신 고정 Quantity를 그대로 참조한다
function numberDraft() {
  const forecast = reportForecast();
  const claim = templateClaims(forecast, "s-yeongjong").find(
    (claim) => claim.claimType === "수치",
  );
  if (!claim) throw new Error("수치 템플릿 없음");
  return { forecast, claim };
}

describe("숫자와 단위 대조", () => {
  // 범위 앞 값도 뒤의 단위를 공유하고 인원을 한국어 서식으로 표시한다
  it("구간 자리표시자 두 개를 Quantity 단위 서식으로 채운다", () => {
    const { forecast, claim } = numberDraft();
    expect(checkNumbers(claim, forecast)).toEqual({
      passed: true,
      rendered:
        "순간 최대 12,000~35,000명 추정 — 추정 산식 기반 · 표본 한계로 구간 기준 표시",
    });
  });

  // 소수 인원 응답도 반올림한 렌더 결과와 같은 서식으로 비교한다
  it("소수 Quantity를 정수·쉼표로 표시하고 검증한다", () => {
    const { forecast, claim } = numberDraft();
    forecast.peakConcurrent.p10 = 2002.4768;
    forecast.peakConcurrent.p90 = 12416.87;
    claim.rendered =
      "순간 최대 2,002~12,417명 추정 — 추정 산식 기반 · 표본 한계로 구간 기준 표시";
    expect(checkNumbers(claim, forecast)).toEqual({
      passed: true,
      rendered: claim.rendered,
    });
    claim.rendered = claim.rendered.replace("2,002", "2,003");
    expect(checkNumbers(claim, forecast).passed).toBe(false);
  });

  // 명/일은 인원 서식을 공유하며 나머지는 소수 둘째 자리와 끝 영 제거를 적용한다
  it.each([
    [2002.4768, "명", "2,002"],
    [12416.87, "명", "12,417"],
    [2002.5, "명/일", "2,003"],
    [12.345, "배", "12.35"],
    [12.3, "%", "12.3"],
    [12, "일", "12"],
  ])("%s %s → %s", (value, unit, expected) => {
    expect(formatQuantity(value, unit)).toBe(expected);
  });

  // 숫자 추가·단위 바꿔치기·바인딩 누락·렌더 변조를 각각 거부한다
  const edits: Record<string, (claim: Claim) => void> = {
    "숫자 추가": (claim) => {
      claim.text += " 1500명";
    },
    "단위 변경": (claim) => {
      claim.text = claim.text.replace("명", "%");
    },
    "새 단위": (claim) => {
      claim.text = claim.text.replace("명", "명/초");
    },
    "바인딩 없는 자리": (claim) => {
      claim.placeholders.pop();
    },
    "남는 바인딩": (claim) => {
      claim.text = "추정 산식 기반";
    },
    "중복 바인딩": (claim) => {
      claim.placeholders.push(claim.placeholders[0]);
    },
    "미등록 Quantity": (claim) => {
      claim.placeholders[0].quantityId = "q-unknown";
    },
    "값이 없는 필드": (claim) => {
      claim.placeholders[0].field = "value";
    },
    "숫자 앞 접합": (claim) => {
      claim.text = claim.text.replace("{{peak_p10}}", "9{{peak_p10}}");
    },
    "숫자 뒤 접합": (claim) => {
      claim.text = claim.text.replace("{{peak_p90}}", "{{peak_p90}}9");
    },
    "음수 부호": (claim) => {
      claim.text = claim.text.replace("{{peak_p10}}", "-{{peak_p10}}");
    },
    "렌더 위조": (claim) => {
      claim.rendered = "순간 최대 1명";
    },
    "전각 숫자": (claim) => {
      claim.text += " １０００명";
    },
    "인용하지 않은 값": (claim) => {
      claim.evidenceIds = [];
    },
  };
  it.each(Object.entries(edits))("%s는 통과하지 않는다", (_name, edit) => {
    const { forecast, claim } = numberDraft();
    edit(claim);
    expect(checkNumbers(claim, forecast).passed).toBe(false);
  });

  // 인용한 문구의 같은 숫자·단위만 예외이며 단순히 어딘가에 있는 수치로는 부족하다
  it.each([
    ["인용한 규칙", "1,000명", true, true],
    ["인용하지 않은 규칙", "1,000명", false, false],
    ["다른 기준 숫자", "1,500명", true, false],
    ["다른 단위", "1,000원", true, false],
    ["입력 JSON 숫자", "2,000명", true, false],
  ])("%s", (_name, text, cite, passed) => {
    const { forecast, claim } = numberDraft();
    const evidence = forecast.evidence.find((item) => item.kind === "rule");
    if (!evidence) throw new Error("규칙 근거 없음");
    evidence.summary = '순간 최대 1,000명 기준 입력: {"수치":"2,000명"}';
    claim.text = text as string;
    claim.placeholders = [];
    claim.evidenceIds = cite ? [evidence.id] : [];
    expect(checkNumbers(claim, forecast).passed).toBe(passed);
  });

  // 법정 문구가 같아도 자체 규칙이나 다른 조항을 붙이면 법규 검사가 거부한다
  it("법정·자체 구분을 조항 근거와 대조한다", () => {
    const forecast = reportForecast();
    const claim = templateClaims(forecast, "s-yeongjong")[0];
    expect(matchesRule(claim, forecast)).toBe(true);
    forecast.judgment.reasons[0].kind = "자체";
    expect(matchesRule(claim, forecast)).toBe(false);
  });

  // 모델이 판정 문장을 다른 유형으로 분류해도 규칙 대조를 우회할 수 없다
  it("규칙 근거를 설명 유형으로 감춘 문장을 거부한다", () => {
    const forecast = reportForecast();
    const claim = templateClaims(forecast, "s-yeongjong")[0];
    claim.claimType = "설명";
    claim.text = "안전관리계획을 생략해도 돼요";
    expect(matchesRule(claim, forecast)).toBe(false);
  });

  // 확률의 Quantity 계약이 생기기 전에는 확률 자리표시자를 만들지 않는다
  it("확률 기준도 수치 문장에는 구간만 싣는다", () => {
    const forecast = reportForecast();
    forecast.judgment.basis = "확률";
    const claim = templateClaims(forecast, "s-yeongjong").find(
      (claim) => claim.claimType === "수치",
    );
    expect(claim?.text).not.toMatch(/[%％]|확률/);
    expect(claim?.placeholders.map((item) => item.field)).toEqual([
      "p10",
      "p90",
    ]);
  });
});

// 날씨 요인 라벨의 숫자·확률 조각은 문장에서 빼고 말로 된 조각만 남겨 숫자·구간 검사를 통과한다(9/26 D-10 회귀)
describe("날씨 요인 문장", () => {
  it("강수확률·기온 숫자를 빼고 날씨 말만 요인 문장으로 쓴다", async () => {
    const forecast = reportForecast();
    const evidenceIds = forecast.evidence.slice(0, 1).map((item) => item.id);
    forecast.factors = [
      {
        feature: "event_weather",
        label: "행사일 강수확률 10%·강수 없음·맑음·최저기온 9℃·최고기온 21℃",
        contribution: 0,
        direction: "neutral",
        evidenceIds,
      },
      {
        feature: "rain_only",
        label: "강수확률 80%",
        contribution: 0,
        direction: "neutral",
        evidenceIds,
      },
    ] as unknown as typeof forecast.factors;
    const claims = templateClaims(forecast, "s-weather");
    const factorClaims = claims.filter((claim) => claim.claimType === "요인");
    expect(factorClaims.map((claim) => claim.text)).toEqual([
      "행사일 날씨 예보 — 강수 없음·맑음",
    ]);
    for (const claim of factorClaims)
      expect(checkNumbers(claim, forecast).passed).toBe(true);
    const { skeptic } = await import("../src/team/verification/skeptic.js");
    const result = await skeptic.run({
      input: { claims, forecast, revision: 1 },
    } as never);
    const index = claims.indexOf(factorClaims[0]);
    expect(result.value[index].passed).toBe(true);
    // 규칙 검사도 숫자만 뺀 라벨을 서비스 라벨과 같은 것으로 본다
    expect(matchesRule(factorClaims[0], forecast)).toBe(true);
  });
});
