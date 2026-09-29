// 실제 영값·자료 부족·불완전 분포·다른 분석 명단을 구별하는 표시 규칙을 검증한다.
import { describe, expect, it } from "vitest";
import {
  analysisDay,
  headlineValue,
  insightSentence,
  levelDistribution,
} from "../insight-data";
import { matchInsightFestivals } from "../insight-festival-matching";
import { festivals, insight } from "./insight-fixtures";

describe("지표별 자료와 실제 영값", () => {
  it("작은 양수와 100% 미만 비율을 정확한 0·100으로 반올림하지 않는다", () => {
    expect(
      headlineValue(
        insight({
          headline: { value: 1 / 3000, unit: "비율", text: "2등급 1건" },
        }),
      ),
    ).toBe("0.1% 미만");
    expect(
      headlineValue(
        insight({
          headline: { value: 2999 / 3000, unit: "비율", text: "2등급 2999건" },
        }),
      ),
    ).toBe("99.9% 초과");
  });
  it("UTC 응답 날짜도 한국 시간으로 표시한다", () => {
    expect(analysisDay("2026-09-30T15:00:00Z")).toBe("2026-10-01");
  });
  it("I2는 전년 비교 자료가 없어도 모델의 0%를 표시한다", () => {
    expect(headlineValue(insight({ comparablePairs: 0 }))).toBe("0%");
    expect(headlineValue(insight({ comparablePairs: null }))).toBe("0%");
  });
  it("I1은 유효 비교쌍이 없는 값 0을 분석 결과로 쓰지 않는다", () => {
    expect(
      headlineValue(insight({ key: "I1", comparablePairs: 0 })),
    ).toBeNull();
    expect(
      headlineValue(insight({ key: "I1", comparablePairs: null })),
    ).toBeNull();
    expect(headlineValue(insight({ sampleSize: 0 }))).toBeNull();
  });
  it("유효 표본의 I1 영값은 0배로 표시한다", () => {
    expect(
      headlineValue(
        insight({
          key: "I1",
          headline: { value: 0, unit: "배", text: "발표값 0인 유효 비교" },
        }),
      ),
    ).toBe("0.0배");
  });
  it("백분율은 표본 수로 재계산하지 않고 API 값을 표시한다", () => {
    expect(
      headlineValue(
        insight({
          headline: { value: 0.125, unit: "비율", text: "경계선 비중" },
        }),
      ),
    ).toBe("12.5%");
  });
  it("복사 문장에도 기간·한계·계산 시각·근거가 포함된다", () => {
    const text = insightSentence(insight());
    expect(text).toContain(
      "표본 2건, 예보 대상 행사 일정 2026-10-01~2026-10-03",
    );
    expect(text).toContain("전년 발표 환산 자료 1건");
    expect(text).toContain("추정 산식 기반");
    expect(text).toContain("계산 시각:");
    expect(text).toContain("근거:");
  });
});

describe("서로 다른 분모와 분포", () => {
  it("모델과 전년 환산 자료를 각각의 표본 수에 대조한다", () => {
    expect(
      levelDistribution(insight(), "model")?.map((row) => row.value),
    ).toEqual([0, 0, 1, 1]);
    expect(
      levelDistribution(insight(), "host")?.map((row) => row.value),
    ).toEqual([1, 0, 0, 0]);
  });
  it("누락 등급이나 잘못된 합계를 0으로 보충하지 않는다", () => {
    expect(
      levelDistribution(
        insight({ series: insight().series.slice(1) }),
        "model",
      ),
    ).toBeNull();
    expect(levelDistribution(insight({ sampleSize: 3 }), "model")).toBeNull();
    expect(
      levelDistribution(insight({ comparablePairs: 0 }), "host"),
    ).toBeNull();
  });
});

describe("분석 대상 행사 연결", () => {
  it("예보 식별자·기간·등급이 일치하는 행사만 연결한다", () => {
    expect(
      matchInsightFestivals(insight(), festivals)?.map((row) => row.forecastId),
    ).toEqual(["f-yeongjong", "f-gangnam"]);
    expect(
      matchInsightFestivals(insight(), [
        ...festivals,
        { ...festivals[0], eventId: "other", forecastId: "other" },
      ]),
    ).toHaveLength(2);
  });
  it("예보가 누락되거나 중복되면 일부를 전체 명단으로 표시하지 않는다", () => {
    expect(matchInsightFestivals(insight(), festivals.slice(1))).toBeNull();
    expect(
      matchInsightFestivals(insight(), [...festivals, festivals[0]]),
    ).toBeNull();
  });
  it("동일 ID라도 기간이나 등급이 달라지면 표시하지 않는다", () => {
    expect(
      matchInsightFestivals(insight(), [
        { ...festivals[0], level: 4 },
        festivals[1],
      ]),
    ).toBeNull();
    expect(
      matchInsightFestivals(insight(), [
        { ...festivals[0], startsAt: "2026-09-30T00:00:00+09:00" },
        festivals[1],
      ]),
    ).toBeNull();
  });
  it("서로 다른 근거의 명단은 합치지 않는다", () => {
    const base = insight();
    const extra = {
      ...base.evidence[0],
      id: "ev-conflict",
      summary: JSON.stringify({ forecastIds: ["other", "f-gangnam"] }),
    };
    expect(
      matchInsightFestivals(
        insight({
          evidenceIds: [...base.evidenceIds, extra.id],
          evidence: [...base.evidence, extra],
        }),
        festivals,
      ),
    ).toBeNull();
  });
  it("근거에 연결되지 않은 명단은 사용하지 않는다", () => {
    expect(
      matchInsightFestivals(
        insight({ evidenceIds: ["ev-unlinked"] }),
        festivals,
      ),
    ).toBeNull();
  });
});
