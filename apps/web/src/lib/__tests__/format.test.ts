// 인원·구간·한국 날짜·확률 표기의 경계값을 표로 검증한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import reportFixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import {
  formatDate,
  formatPeople,
  formatPercent,
  formatQuantity,
  formatRange,
  representativeValue,
} from "../format";

const report = reportFixture as unknown as ForecastReport;

// 만 단위 전환과 쉼표가 계약 수치를 잃지 않게 한다.
describe("format", () => {
  it.each([
    [0, "0명"],
    [9999, "9,999명"],
    [10_000, "1만 명"],
    [1450, "1,450명"],
    [21_000, "2.1만 명"],
    [100_000, "10만 명"],
  ])("인원 %i → %s", (value, expected) => {
    expect(formatPeople(value)).toBe(expected);
  });

  // 양 끝의 표기를 같은 함수로 계산한다.
  it.each([
    [1200, 3500, "1,200명 ~ 3,500명"],
    [12_000, 35_000, "1.2만 명 ~ 3.5만 명"],
  ])("구간 %i~%i", (low, high, expected) => {
    expect(formatRange(low, high)).toBe(expected);
  });

  // 시간대가 다른 런타임에서도 한국 표준시 날짜를 유지한다.
  it.each([
    ["2025-10-18T19:00:00+09:00", "10.18(토) 19:00"],
    ["2025-10-18T10:00:00Z", "10.18(토) 19:00"],
    ["2025-10-01", "10.01(수)"],
  ])("날짜 %s", (value, expected) => {
    expect(formatDate(value)).toBe(expected);
  });

  // 계약의 0~1 확률과 이미 주어진 구간을 정수 백분율로 읽는다.
  it.each([
    [0.94, "94%"],
    [1, "100%"],
    [{ low: 0.62, high: 0.94 }, "62~94%"],
  ])("확률 %j", (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });

  // 계약 수치의 일 단위·누적 단위·추정 여부가 표기에서 빠지지 않는다.
  it.each([
    [
      report.card.dailyMean,
      "1.3만 명/일 (일 · 행사장) · 예측 구간 7,400명/일 ~ 2.2만 명/일",
    ],
    [
      report.card.peakConcurrent,
      "2.1만 명 (순간 · 행사장) · 예측 구간 1.2만 명 ~ 3.5만 명 · 추정 산식 기반",
    ],
    [
      report.event.expectedByHost as NonNullable<
        ForecastReport["event"]["expectedByHost"]
      >,
      "2,000명 (기간 누적 · 행사장)",
    ],
    [
      {
        ...(report.event.expectedByHost as NonNullable<
          ForecastReport["event"]["expectedByHost"]
        >),
        estimated: true,
      },
      "2,000명 (기간 누적 · 행사장) · 추정",
    ],
  ])("계약 수치 %j", (quantity, expected) => {
    expect(formatQuantity(quantity)).toBe(expected);
  });

  // 명시된 값과 중앙값이 함께 있으면 원래 값이 표시와 좌표의 기준이다.
  it("대표값은 value를 먼저 사용한다", () => {
    const quantity = {
      ...report.event.expectedByHost,
      value: 2000,
      p50: 5000,
    } as NonNullable<ForecastReport["event"]["expectedByHost"]>;
    expect(representativeValue(quantity)).toBe(2000);
    expect(formatQuantity(quantity)).toContain("2,000명");
    expect(formatQuantity(quantity)).not.toContain("5,000명 (기간");
  });

  // 배수와 비율의 소수는 인원 반올림 규칙을 적용하지 않는다.
  it.each([
    [0.8, "배", "0.8배"],
    [1.25, "비율", "1.25비율"],
  ])("소수 단위 %s%s", (value, unit, expected) => {
    expect(formatQuantity(value, unit)).toBe(expected);
  });
});
