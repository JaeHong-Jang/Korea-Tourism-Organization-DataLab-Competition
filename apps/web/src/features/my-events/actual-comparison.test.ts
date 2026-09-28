// 실측과 예보 비교가 범위·공간 범위·빈 값·예보 선택 규칙을 지키는지 확인한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import reportFixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { compareActual, forecastBeforeEvent } from "./actual-comparison";

const report = reportFixture as unknown as ForecastReport;

// 일평균 예보 7,400–22,000(중앙값 13,000) 안팎의 실측을 판정한다.
it("예측 범위 안팎과 중앙값 대비 차이를 계산한다", () => {
  const inside = compareActual(report, "daily", 15600, "행사장");
  expect(inside).toMatchObject({
    kind: "ok",
    inRange: true,
    p10: 7400,
    p90: 22000,
  });
  if (inside.kind === "ok") expect(inside.ratio).toBeCloseTo(0.2);
  const outside = compareActual(report, "peak", 40000, "행사장");
  expect(outside).toMatchObject({ kind: "ok", inRange: false, unit: "명" });
});

// 예보와 실측의 공간 범위가 다르면 숫자를 비교하지 않는다.
it("공간 범위가 다르면 비교하지 않는다", () => {
  expect(compareActual(report, "daily", 15600, "시군구")).toEqual({
    kind: "scope",
    forecastScope: "행사장",
  });
});

// 예보가 없거나 범위 값이 비어 있으면 비교 결과를 만들지 않는다.
it("예보나 범위가 없으면 비교하지 않는다", () => {
  expect(compareActual(undefined, "daily", 100, "행사장")).toEqual({
    kind: "none",
  });
  const empty = {
    ...report,
    forecast: {
      ...report.forecast,
      dailyMean: { ...report.forecast.dailyMean, p90: null },
    },
  } as ForecastReport;
  expect(compareActual(empty, "daily", 100, "행사장")).toEqual({
    kind: "missing",
  });
});

// 행사 시작 전에 발행된 마지막 예보를 고르고, 없으면 가장 최근 예보를 쓴다.
it("행사 전 마지막 예보를 비교 기준으로 고른다", () => {
  const early = {
    ...report,
    forecastId: "early",
    publishedAt: "2025-10-01T09:00:00+09:00",
  };
  const late = {
    ...report,
    forecastId: "late",
    publishedAt: "2025-10-10T09:00:00+09:00",
  };
  const after = {
    ...report,
    forecastId: "after",
    publishedAt: "2025-10-20T09:00:00+09:00",
  };
  const startsAt = "2025-10-18T19:00:00+09:00";
  expect(forecastBeforeEvent([early, late, after], startsAt)?.forecastId).toBe(
    "late",
  );
  expect(forecastBeforeEvent([after], startsAt)?.forecastId).toBe("after");
  expect(forecastBeforeEvent([], startsAt)).toBeUndefined();
});
