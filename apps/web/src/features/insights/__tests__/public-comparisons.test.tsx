// 집계 단위가 다른 공개 사례와 근사 수치를 확정 비교 비율로 표시하지 않는지 확인한다.
// @vitest-environment jsdom

import type { Insight } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { publicComparisons } from "../public-comparison-data";
import { PublicComparisons } from "../public-comparisons";
import { insight } from "./insight-fixtures";

// API 근거 안의 공개 자료를 기존 I1 비교 표본과 분리한 형태로 구성한다.
function fixture(
  unit = "명",
  value = 270000,
  ratio: number | null = null,
): Insight {
  const base = insight({ key: "I1", sampleSize: 0, comparablePairs: 0 });
  return {
    ...base,
    evidence: [
      {
        ...base.evidence[0],
        summary: JSON.stringify({
          publicComparisons: [
            {
              id: "hongcheon-2026",
              eventId: "e-hongcheon-2026",
              year: 2026,
              eventName: "홍천강 꽁꽁축제",
              periodLabel: "2026.01.09 ~ 01.25",
              status: "conditions_unverified",
              limitation: "집계 구역 미확인",
              ratio,
              announced: {
                label: "주최측 발표",
                value,
                unit,
                approximate: true,
              },
              observed: {
                label: "통신 추정",
                value: 379542,
                unit: "명",
                approximate: false,
              },
              sources: [
                { title: "발표", url: "https://www.hongcheon.go.kr/a" },
                { title: "관측", url: "https://www.hongcheon.go.kr/b" },
              ],
            },
          ],
        }),
      },
    ],
  };
}

it("집계 기간이 확인되지 않은 원수치만 보여 주고 유효 비교쌍을 늘리지 않는다", () => {
  const value = fixture();
  const html = renderToStaticMarkup(<PublicComparisons insight={value} />);
  expect(html).toContain("약 270,000");
  expect(html).toContain("379,542");
  expect(html).toContain("집계 기준이 다른 참고 수치입니다.");
  expect(html).not.toContain("일평균 환산");
  expect(html).not.toContain("0.71");
  expect(value.comparablePairs).toBe(0);
});

it("매수와 인원은 원수치로 구분하고 실제 영값을 보존한다", () => {
  const html = renderToStaticMarkup(
    <PublicComparisons insight={fixture("매", 0)} />,
  );
  expect(html).not.toContain("insights-bar-track");
  expect(html).toContain("약 0");
  expect(html).toContain("매");
});

it("미확인 비율·음수·알 수 없는 단위는 공개하지 않는다", () => {
  expect(publicComparisons(fixture("명", 270000, 0.71))).toEqual([]);
  expect(publicComparisons(fixture("명", -1))).toEqual([]);
  expect(publicComparisons(fixture("건"))).toEqual([]);
});
