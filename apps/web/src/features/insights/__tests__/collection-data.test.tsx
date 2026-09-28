// 수집 통계의 합계와 단위가 깨지거나 관측만 있는 경우에도 한계가 보존되는지 확인한다.
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  type CollectionInventory,
  type CollectionRow,
  collectionData,
} from "../collection-data";
import { CollectionEvent } from "../collection-event";
import { PastEventComparison } from "../past-event-comparison";
import { insight } from "./insight-fixtures";

// 영값 발표와 센서 관측을 가진 실제 행사 형태의 테스트 자료를 만든다.
function row(): CollectionRow {
  return {
    id: "sdm-2025",
    eventName: "서대문봄빛축제",
    year: 2025,
    region: "서대문구",
    start: "2025-04-04",
    end: "2025-04-13",
    dateBasis: "보고서 분석 기간",
    recurrenceYears: [2024, 2025],
    announced: { value: 0, unit: "명", label: "발표 기재값" },
    observed: { value: 546018, unit: "명(센서 연인원)", label: "센서 측정" },
    regional: null,
    status: "both",
    needsReview: false,
    directComparable: false,
    limitation: "중복 포함·센서 추가",
    publicId: null,
    sources: [],
  };
}

// 각 연도의 개별 행과 상태별 건수를 함께 구성한다.
function fixture(): CollectionInventory {
  return {
    version: 1,
    asOf: "2026-09-28",
    rows: [row()],
    repeatedGroups: 1,
    threeYearGroups: 0,
    scope: "보유 목록 기준",
    years: [2024, 2025, 2026].map((year) => ({
      year,
      registered: year === 2025 ? 1 : 0,
      ended: year === 2025 ? 1 : 0,
      dateMissing: 0,
      notEnded: 0,
      announced: year === 2025 ? 1 : 0,
      observed: year === 2025 ? 1 : 0,
      regional: 0,
      needsReview: 0,
      directComparable: 0,
      statuses: {
        both: year === 2025 ? 1 : 0,
        announced: 0,
        observed: 0,
        missing: 0,
      },
    })),
  };
}

// 기존 계약의 유연한 근거 필드에 넣어 실제 응답과 같은 경로로 읽는다.
function parse(data: CollectionInventory) {
  const value = insight({ key: "I1" });
  value.evidence[0].summary = JSON.stringify({ collectionInventory: data });
  return collectionData(value);
}

// 7개년 응답도 검증하며 연도 요약 중복이나 누락을 허용하지 않는다.
it("2020~2026년 목록과 요약을 함께 확인한다", () => {
  const data = fixture();
  data.rows[0].year = 2020;
  data.years = [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year) => ({
    ...fixture().years[year === 2020 ? 1 : 0],
    year,
  }));
  expect(parse(data)?.years).toHaveLength(7);
  data.years.push(data.years[0]);
  expect(parse(data)).toBeNull();
  data.years = data.years.filter((row) => row.year !== 2020);
  expect(parse(data)).toBeNull();
});

it("실제 0과 자료 미확보를 구분하고 센서 단위를 섞지 않는다", () => {
  const data = fixture();
  expect(parse(data)?.rows[0].announced?.value).toBe(0);
  const output = renderToStaticMarkup(<CollectionEvent row={data.rows[0]} />);
  expect(output).toContain("0명");
  expect(output).not.toContain("insights-bar-track");
  expect(output).toContain("센서 연인원");
});

it("표본 합계나 상태별 건수 불일치를 숨기지 않고 거부한다", () => {
  const data = fixture();
  data.years[1].ended = 2;
  expect(parse(data)).toBeNull();
  data.years[1].ended = 1;
  data.years[1].statuses.both = 0;
  expect(parse(data)).toBeNull();
});

it("관측만 있는 자료도 분석기간·측정 한계를 표시한다", () => {
  const value = row();
  value.announced = null;
  value.status = "observed";
  const output = renderToStaticMarkup(<CollectionEvent row={value} />);
  expect(output).toContain("미확보");
  expect(output).toContain("중복 포함·센서 추가");
  expect(output).toContain("보고서 분석 기간");
});

// 발표·관측 비교에서는 영값과 수치가 없는 행사를 표시하지 않는다.
it("값이 0이거나 수치가 없는 행사를 비교 목록에서 제외한다", () => {
  const data = fixture();
  data.rows.push({
    ...row(),
    id: "jinju-2025",
    eventName: "진주남강유등축제",
    announced: null,
    observed: null,
    status: "missing",
  });
  data.years[1].registered = 2;
  data.years[1].ended = 2;
  data.years[1].statuses.missing = 1;
  const value = insight({ key: "I1" });
  value.evidence[0].summary = JSON.stringify({ collectionInventory: data });
  const html = renderToStaticMarkup(<PastEventComparison insight={value} />);
  expect(html.match(/data-event-id=/g) ?? []).toHaveLength(0);
  expect(html).not.toContain("진주남강유등축제");
  expect(html).not.toContain("서대문봄빛축제");
  expect(html).not.toContain("미확보");
  expect(html).not.toContain("0명");
});
