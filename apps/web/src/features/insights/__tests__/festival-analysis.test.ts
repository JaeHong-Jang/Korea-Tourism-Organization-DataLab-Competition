// 월 경계·인원 구간·복합 조건에서 집계 대상이 어긋나지 않는지 확인한다.
import { expect, it } from "vitest";
import {
  countFestivals,
  filterFestivals,
  peakDistribution,
  startMonth,
} from "../festival-analysis";
import { festivals } from "./insight-fixtures";

// 여러 달에 걸친 행사도 한국 시간의 시작 월에 한 번만 센다.
it("시작 월은 한국 시간으로 한 번만 센다", () => {
  const rows = [
    {
      ...festivals[0],
      startsAt: "2026-09-30T16:00:00Z",
      endsAt: "2026-12-01T00:00:00+09:00",
    },
    festivals[1],
  ];
  expect(rows.map(startMonth)).toEqual(["2026-10", "2026-10"]);
  expect(countFestivals(rows, startMonth)).toEqual([
    { label: "2026-10", value: 2 },
  ]);
});

// 서로 다른 필터가 함께 적용되고 빈 결과를 0건으로 보존한다.
it("복합 필터와 검색은 같은 표본을 선택한다", () => {
  const base = {
    month: "2026-10",
    region: festivals[1].sigunguCode,
    type: festivals[1].type,
    query: "강남",
  };
  expect(filterFestivals(festivals, base)).toEqual([festivals[1]]);
  expect(filterFestivals(festivals, { ...base, month: "2026-11" })).toEqual([]);
});

// 구간 경계와 실제 0을 중복 없이 세고 지역 축약도 전체 건수를 보존한다.
it("설명용 인원 구간과 지역 집계에서 표본 수가 보존된다", () => {
  const rows = [0, 999, 1000, 4999, 5000, 9999, 10000, 19999, 20000].map(
    (peakP50, i) => ({
      ...festivals[0],
      peakP50,
      name: String(i),
    }),
  );
  expect(peakDistribution(rows).map((row) => row.value)).toEqual([
    2, 2, 2, 2, 1,
  ]);
  expect(peakDistribution([]).map((row) => row.value)).toEqual([0, 0, 0, 0, 0]);
  expect(
    countFestivals(rows, (row) => row.name, 2).reduce(
      (sum, row) => sum + row.value,
      0,
    ),
  ).toBe(9);
});
