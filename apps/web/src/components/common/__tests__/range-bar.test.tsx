// 누적 예상과 순간 최대의 비교 조건, 보통 눈금의 기준선 위치와 배수 문장을 검증한다.
import type {
  FestivalSummary,
  ForecastReport,
} from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import festivalFixture from "../../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import reportFixture from "../../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { niceCeil, RangeBar } from "../../charts/range-bar";
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
    // 0부터 시작하는 보통 눈금이므로 기준선 위치는 1,000 ÷ 눈금 끝값이다.
    const axisMax = niceCeil(Math.max(festival.peakP90, 1000) * 1.08);
    expect(range).toContain(
      `class="range-bar__threshold range-bar__target" style="left:${Math.round((1000 / axisMax) * 1000) / 10}%"`,
    );
    expect(range).toContain("법정 기준 1,000명의 약");
    expect(range).toContain("값 표 보기");
    expect(range).not.toContain("순간 최대 예상 인원과 법정 기준");
    expect(range).not.toContain("▲ 주최측 예상");
    expect(range).toContain("aria-label=");
  });

  // 큰 구간은 막대 바로 위 값과 법정 기준, 배수 결론으로 읽힌다.
  it("순간 최대의 직접 라벨과 기준 배수를 카드 값으로 만든다", () => {
    const markup = renderToStaticMarkup(
      <RangeBar
        range={{ ...festival, peakP10: 7857, peakP50: 14000, peakP90: 26000 }}
      />,
    );
    expect(markup).toContain("순간 최대 예상 인원과 법정 기준");
    expect(markup).toContain("예상 7,857~26,000명 (가운데 1.4만 명)");
    expect(markup).toContain("법정 기준 1,000명(안전관리계획 수립)");
    expect(markup).toContain("법정 기준의 약 14배");
    expect(markup).toContain("안전관리계획 수립 대상이에요");
    expect(markup).not.toContain("로그 축");
    // 눈금 끝은 상한 26,000의 1.08배를 올린 5만, 가운데 눈금은 2.5만이다.
    expect(markup).toContain(">2.5만 명<");
    expect(markup).toContain(">5만 명<");
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
    const hostMax = niceCeil(Math.max(festival.peakP90, 2000, 1000) * 1.08);
    expect(hostPosition).toBeCloseTo(
      Math.round((2000 / hostMax) * 1000) / 10,
      6,
    );
    expect(hostButton).toContain("주최측 예상 2,000명");
    expect(hostButton).not.toContain("5,000명");
    expect(markup).toContain("주최측 예상</th><td>주최측 예상 2,000명");
  });
});
