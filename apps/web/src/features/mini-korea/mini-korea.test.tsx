// S1 요약과 고지, 시군구 합계가 같은 계약 값을 쓰는지 검증한다.

import type { FestivalSummary } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import card from "../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import { placeFestivals } from "../../components/scene/festival-models/placement";
import { SceneLegend } from "../../components/scene/scene-legend";
import { sigunguPeaks, tileRanges, tileStep } from "./data-mode";
import { DataModeToggle } from "./data-mode-toggle";
import { consultationText, FestivalSummaryPanel } from "./festival-summary";
import { HonestNotices } from "./honest-notices";

const festival = card as FestivalSummary;

describe("S1 미리보기", () => {
  // 구간 끝점은 계약 정수를 쉼표로 보여 주고 확률은 화면에 넣지 않는다.
  it("선택 행사만 상담 문장과 구간을 보여 준다", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FestivalSummaryPanel festival={festival} />
      </MemoryRouter>,
    );
    expect(html).toContain("12,000~35,000명 추정");
    expect(html).toContain("표본 한계로 구간 기준 표시");
    expect(html).not.toContain("99%");
    expect(html).toContain("대규모");
    expect(consultationText(festival)).toBe(
      "10월 18일 인천 중구 영종 씨사이드파크 불꽃축제",
    );
    expect(
      renderToStaticMarkup(
        <MemoryRouter>
          <FestivalSummaryPanel festival={{ ...festival, ood: true }} />
        </MemoryRouter>,
      ),
    ).toContain("참고용 — 담당자 검토 필수");
    expect(
      renderToStaticMarkup(
        <FestivalSummaryPanel festival={null} status="error" />,
      ),
    ).toContain("예보 형식을 확인해 주세요.");
  });

  // 미검증 필드가 없으면 재현 사례 문구를 추측해 표시하지 않는다.
  it("고지 조건과 견본 표시를 분리한다", () => {
    const render = (festivals: FestivalSummary[], fixture: boolean) =>
      renderToStaticMarkup(
        <HonestNotices festivals={festivals} fixture={fixture} />,
      );
    expect(render([festival], true)).toContain("골든 사례 0건");
    expect(render([festival], true)).toContain("견본 데이터");
    expect(
      render([{ ...festival, modelVerdict: undefined }], false),
    ).not.toContain("골든 사례 0건");
    expect(render([], false)).toContain("작은 행사는 크게 예보될 수 있어요");
  });

  // 필터에 남은 두 행사만 같은 시군구로 합산하고 색 단계는 다섯 단계로 제한한다.
  it("시군구별 중앙값을 더하고 모드의 접근성 상태를 노출한다", () => {
    const totals = sigunguPeaks([
      festival,
      { ...festival, eventId: "e-2", peakP50: 4000 },
      { ...festival, eventId: "e-3", sigunguCode: "11110", peakP50: 1000 },
    ]);
    expect(totals.get("28110")).toBe(25000);
    expect(totals.get("11110")).toBe(1000);
    expect(tileStep(25000, 25000)).toBe(5);
    expect(tileStep(1000, 25000)).toBe(1);
    expect(tileStep(null, 25000)).toBe(0);
    expect(tileStep(0, 25000)).toBe(1);
    expect(tileStep(5001, 25000)).toBe(2);
    expect(tileRanges(25000)).toEqual([
      { step: 1, min: 0, max: 5000 },
      { step: 2, min: 5001, max: 10000 },
      { step: 3, min: 10001, max: 15000 },
      { step: 4, min: 15001, max: 20000 },
      { step: 5, min: 20001, max: 25000 },
    ]);
    expect(
      tileRanges(
        Math.max(
          ...sigunguPeaks([
            festival,
            { ...festival, eventId: "e-2", peakP50: 4000 },
          ]).values(),
        ),
      ),
    ).toEqual(tileRanges(25000));
    const legend = renderToStaticMarkup(
      <SceneLegend
        peoplePerDoll={100}
        capExceeded={false}
        festivals={[]}
        dataMode
        totals={totals}
      />,
    );
    expect(legend).toContain("예보 없음");
    expect(legend).toContain("20,001~25,000명");
    expect(legend).toContain("지금 필터 기준으로 다시 나눔");
    expect(legend).toContain("데이터 모드에서는 열차·차량을 숨겨요");
    expect(placeFestivals([festival], totals)[0].y).toBe(10);
    expect(
      renderToStaticMarkup(<DataModeToggle enabled onChange={() => {}} />),
    ).toContain('aria-pressed="true"');
  });
});
