// 일평균 막대의 단위·등급·전체 축과 검색 회귀를 검증한다.
// @vitest-environment jsdom
import type { Insight } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { DailyForecastChart } from "../daily-forecast-chart";
import { dailyScale } from "../daily-scale-data";
import { forecastPeople } from "../forecast-people-data";
import { insight } from "./insight-fixtures";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 예측 중앙값이 작은 행의 상한이 더 큰 경우를 포함해 축 잘림을 탐지한다.
function fixture(): Insight {
  const base = insight({ sampleSize: 3 });
  const values = [9000, 18691, 24995];
  const people = values.map((value, index) => ({
    forecastId: `f-${index}`,
    eventId: `e-${index}`,
    name: ["연천구석기축제", "강남페스티벌", "홍천강 꽁꽁축제"][index],
    start: "2026-10-01",
    end: "2026-10-03",
    dailyScaleGrade: index + 1,
    dailyMean: {
      p10: 1000,
      p50: value,
      p90: index === 0 ? 56464 : 33724,
      unit: "명/일",
    },
    peakConcurrent: { p10: 100, p50: 200, p90: 300, unit: "명" },
  }));
  return {
    ...base,
    evidence: [
      {
        ...base.evidence[0],
        summary: JSON.stringify({
          forecastIds: people.map((row) => row.forecastId),
          forecastPeople: people,
          dailyScale: {
            method: "fixed",
            basis: "dailyMean.p50",
            unit: "명/일",
            sampleSize: 3,
            classCount: 3,
            bands: [
              {
                grade: 1,
                lowerInclusive: 0,
                upperExclusive: 10000,
                count: 1,
              },
              {
                grade: 2,
                lowerInclusive: 10000,
                upperExclusive: 20000,
                count: 1,
              },
              {
                grade: 3,
                lowerInclusive: 20000,
                upperExclusive: null,
                count: 1,
              },
            ],
          },
        }),
      },
    ],
  };
}

// 등급과 실제 수치가 어긋나거나 경계가 겹친 응답은 차트에 사용하지 않는다.
it("잘못된 등급과 중복 경계는 거부한다", () => {
  const value = fixture();
  const rows = forecastPeople(value);
  if (!rows) throw new Error("예보 픽스처 오류");
  expect(dailyScale(value, rows)).not.toBeNull();
  expect(
    dailyScale(value, [{ ...rows[0], dailyScaleGrade: 3 }, ...rows.slice(1)]),
  ).toBeNull();
  const data = JSON.parse(value.evidence[0].summary);
  data.dailyScale.bands[1].lowerInclusive = 0;
  value.evidence[0].summary = JSON.stringify(data);
  expect(dailyScale(value, rows)).toBeNull();
});

// 필터를 바꿔도 남은 행의 등급과 숫자 축은 전체 표본 기준으로 고정한다.
it("실제 명/일 막대와 등급을 함께 표시하고 필터에서도 전체 축을 유지한다", async () => {
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DailyForecastChart insight={fixture()} />
      </MemoryRouter>,
    ),
  );
  const order = node.querySelector(
    'select[aria-label="행사 정렬"]',
  ) as HTMLSelectElement;
  await act(async () => {
    order.value = "size";
    order.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const bars = Array.from(node.querySelectorAll("svg"));
  expect(bars).toHaveLength(3);
  expect(bars.map((bar) => bar.getAttribute("data-p50"))).toEqual([
    "24995",
    "18691",
    "9000",
  ]);
  expect(
    bars.every((bar) => bar.getAttribute("data-maximum") === "24995"),
  ).toBe(true);
  expect(bars[0].getAttribute("aria-label")).toContain("24,995명/일");
  expect(
    Number(bars[0].querySelector("rect")?.getAttribute("width")),
  ).toBeCloseTo(992);
  expect(node.querySelector("details")).toBeNull();
  expect(node.querySelector("svg line, svg path")).toBeNull();
  expect(node.textContent).not.toContain("동시 인원");
  const select = node.querySelector<HTMLSelectElement>(
    'select[aria-label="일평균 규모 등급"]',
  );
  if (!select) throw new Error("등급 필터 누락");
  await act(async () => {
    select.value = "1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(node.querySelectorAll("svg")).toHaveLength(1);
  expect(node.querySelector("svg")?.getAttribute("data-maximum")).toBe("24995");
  expect(node.querySelector("svg")?.getAttribute("data-grade")).toBe("1");
  const picker = node.querySelector<HTMLSelectElement>(
    'select[aria-label="행사 선택"]',
  );
  if (!picker) throw new Error("행사 목록 누락");
  expect(picker.options).toHaveLength(4);
  expect(node.querySelector("input")).toBeNull();
  expect(node.textContent).toContain("소규모");
  expect(node.textContent).toContain("중규모");
  expect(node.textContent).toContain("대규모");
  await act(async () => {
    picker.value = "f-2";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(node.querySelectorAll("svg")).toHaveLength(1);
  expect(node.querySelector("svg")?.getAttribute("data-p50")).toBe("24995");
  expect(node.querySelector("svg")?.getAttribute("data-maximum")).toBe("24995");
  await act(async () => root.unmount());
});
