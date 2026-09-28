// 표본 연결·단위 오류와 검색으로 잘못된 행사 숫자를 보여 주는 회귀를 막는다.
// @vitest-environment jsdom

import type { Insight } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { forecastPeople } from "../forecast-people-data";
import { InsightEventForecast } from "../insight-event-forecast";
import { insight as baseInsight } from "./insight-fixtures";

// 예보 계약의 근거 구조를 재사용하고 실제 영값을 포함한다.
function fixture(): Insight {
  const base = baseInsight();
  return {
    ...base,
    sampleSize: 1,
    evidenceIds: ["e"],
    evidence: [
      {
        ...base.evidence[0],
        id: "e",
        summary: JSON.stringify({
          forecastIds: ["f"],
          forecastPeople: [
            {
              forecastId: "f",
              eventId: "event",
              name: "연천구석기축제",
              start: "2026-05-01",
              end: "2026-05-03",
              dailyMean: { p10: 0, p50: 0, p90: 10, unit: "명/일" },
              peakConcurrent: { p10: 0, p50: 0, p90: 5, unit: "명" },
            },
          ],
        }),
      },
    ],
  };
}

it("하루와 순간 단위를 보존하고 연결되지 않은 예보를 숨긴다", () => {
  const insight = fixture();
  expect(forecastPeople(insight)?.[0].dailyMean.p50).toBe(0);
  const data = JSON.parse(insight.evidence[0].summary);
  data.forecastPeople[0].dailyMean.unit = "명";
  insight.evidence[0].summary = JSON.stringify(data);
  expect(forecastPeople(insight)).toBeNull();
  data.forecastPeople[0].dailyMean.unit = "명/일";
  data.forecastIds = ["다른예보"];
  insight.evidence[0].summary = JSON.stringify(data);
  expect(forecastPeople(insight)).toBeNull();
});

it("두 구간 그래프와 숫자를 같은 행사로 렌더링한다", async () => {
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <InsightEventForecast insight={fixture()} />
      </MemoryRouter>,
    ),
  );
  expect(node.textContent).toContain("하루 평균 방문객");
  expect(node.textContent).toContain("가장 붐빌 때 동시 인원");
  expect(node.textContent).toContain("0~10 명/일");
  expect(node.textContent).toContain("0~5 명");
  expect(node.querySelector("a")?.getAttribute("href")).toBe("/f/f");
  await act(async () => root.unmount());
});
