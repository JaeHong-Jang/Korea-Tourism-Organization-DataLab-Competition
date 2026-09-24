// 누적 예상과 순간 최대의 비교 조건 및 축 라벨 위치를 검증한다.
import type {
  FestivalSummary,
  ForecastReport,
} from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import festivalFixture from "../../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import reportFixture from "../../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { RangeBar } from "../../charts/range-bar";
import { FestivalCard } from "../festival-card";

const report = reportFixture as unknown as ForecastReport;
const festival = festivalFixture as FestivalSummary;

// 축에는 집계 시간이 같은 주최측 예상만 겹쳐 놓는다.
describe("구간 차트", () => {
  // 누적 예상은 순간 최대 축 밖에 두고 같은 단위 예상만 삼각형으로 표시한다.
  it("compact 행사와 mini 구간", () => {
    const card = renderToStaticMarkup(
      <FestivalCard festival={festival} variant="compact" />,
    );
    const range = renderToStaticMarkup(
      <RangeBar
        range={festival}
        hostExpected={report.event.expectedByHost}
        mini
      />,
    );
    expect(card).toContain("festival-card--compact");
    expect(card).toContain("range-bar--mini");
    expect(range).toContain("range-bar__threshold");
    expect(range).not.toContain("range-bar__host");
    expect(range).toContain("기간 누적");
    expect(range).toContain("단위가 달라 직접 비교하지 않아요");
    const comparable = renderToStaticMarkup(
      <RangeBar
        range={festival}
        hostExpected={
          report.event.expectedByHost && {
            ...report.event.expectedByHost,
            timeUnit: "순간",
          }
        }
      />,
    );
    expect(comparable).toContain("range-bar__host");
    const differentArea = renderToStaticMarkup(
      <RangeBar
        range={festival}
        hostExpected={
          report.event.expectedByHost && {
            ...report.event.expectedByHost,
            timeUnit: "순간",
            spatialScope: "시군구",
          }
        }
      />,
    );
    expect(differentArea).not.toContain("range-bar__host");
    expect(differentArea).toContain("단위가 달라 직접 비교하지 않아요");
    expect(range).toContain(
      'class="range-bar__threshold range-bar__target" style="left:60%"',
    );
    expect(range).toContain('<span style="left:60%">기준 1,000명');
    expect(range).toContain("값 표 보기");
    expect(range).toContain("로그 눈금");
    expect(range).toContain("구간 p10–p90 · 중앙 p50 · 기준선");
    expect(range).not.toContain("▲ 주최측 예상");
    expect(range).toContain("aria-label=");
  });

  // 주최측 수치에 value와 p50이 함께 있으면 ▲ 좌표와 읽는 값이 일치한다.
  it("주최측 삼각형의 좌표와 툴팁에 같은 대표값을 쓴다", () => {
    const host = report.event.expectedByHost;
    if (!host) throw new Error("주최측 견본 수치가 없어요");
    const markup = renderToStaticMarkup(
      <RangeBar
        range={festival}
        hostExpected={{ ...host, value: 2000, p50: 5000, timeUnit: "순간" }}
      />,
    );
    const hostButton = markup.match(
      /<button[^>]*class="range-bar__host[^>]*>/,
    )?.[0];
    expect(hostButton).toBeDefined();
    const hostPosition = Number(hostButton?.match(/left:([\d.]+)%/)?.[1]);
    expect(hostPosition).toBeCloseTo((Math.log10(2000) / 5) * 100, 6);
    expect(hostButton).toContain("주최측 예상 2,000명");
    expect(hostButton).not.toContain("5,000명");
    expect(markup).toContain("주최측 예상</th><td>주최측 예상 2,000명");
  });
});
