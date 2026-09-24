// 계약 견본으로 도메인 부품의 실제 값·상태·접근성 이름을 검증한다.
import type {
  Evidence,
  FestivalSummary,
  ForecastReport,
  OpsStatus,
  SimilarEvent,
} from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import evidenceFixture from "../../../../../../packages/contracts/fixtures/evidence/valid-data.json";
import festivalFixture from "../../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import reportFixture from "../../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import opsFixture from "../../../../../../packages/contracts/fixtures/ops-status/valid-example.json";
import similarFixture from "../../../../../../packages/contracts/fixtures/similar-event/valid-yeongjong-2024.json";
import { KitPage } from "../../../pages/dev/kit-page";
import { RangeBar } from "../../charts/range-bar";
import { AskButtons } from "../ask-buttons";
import { ChecklistItem } from "../checklist-item";
import { EmptyState } from "../empty-state";
import { ErrorState } from "../error-state";
import { EventChipCard } from "../event-chip-card";
import { EvidenceCard } from "../evidence-card";
import { EvidenceChip } from "../evidence-chip";
import { FactorList } from "../factor-list";
import { FestivalCard } from "../festival-card";
import { InsightCard } from "../insight-card";
import { KeyNumber } from "../key-number";
import { KpiTile } from "../kpi-tile";
import { LevelBadge } from "../level-badge";
import { SimilarEventCard } from "../similar-event-card";
import { SourceTip } from "../source-tip";

const report = reportFixture as unknown as ForecastReport;
const festival = festivalFixture as FestivalSummary;
const evidence = evidenceFixture as Evidence;
const similar = similarFixture as unknown as SimilarEvent;
const ops = opsFixture as unknown as OpsStatus;
const draft = {
  name: null,
  type: null,
  startsAt: null,
  endsAt: null,
  timeOfDay: null,
  venueText: null,
  sigunguCode: null,
  sigunguName: null,
  fee: null,
  hostType: null,
  budgetKrw: null,
  promo: [],
  hazards: [],
  missing: [],
  ambiguities: [],
};
const insight = {
  key: "I1",
  title: "영종 행사 비교",
  headline: {
    value: 21_000,
    unit: "명",
    text: "영종 행사 예보의 순간 최대예요.",
  },
  sampleSize: 1,
  comparablePairs: null,
  period: { from: "2025-10-18", to: "2025-10-18" },
  series: [],
  evidenceIds: [evidence.id],
  evidence: [evidence],
  computedAt: "2025-10-04",
} as unknown as Parameters<typeof InsightCard>[0]["insight"];

// 각 부품이 실제 계약 값을 읽고 상태별 안내를 내는지 검사한다.
describe("도메인 부품", () => {
  const cases = [
    {
      name: "LevelBadge",
      ready: <LevelBadge judgment={report.card.judgment} />,
      missing: <LevelBadge />,
      loading: <LevelBadge status="loading" />,
      error: <LevelBadge status="error" />,
      text: "대규모",
    },
    {
      name: "RangeBar",
      ready: (
        <RangeBar range={festival} hostExpected={report.event.expectedByHost} />
      ),
      missing: <RangeBar />,
      loading: <RangeBar status="loading" />,
      error: <RangeBar status="error" />,
      text: "주최측 예상",
    },
    {
      name: "KeyNumber",
      ready: (
        <KeyNumber quantity={report.card.peakConcurrent} evidence={evidence} />
      ),
      missing: <KeyNumber />,
      loading: <KeyNumber status="loading" />,
      error: <KeyNumber status="error" />,
      text: "2.1만 명",
    },
    {
      name: "EvidenceChip",
      ready: <EvidenceChip evidence={evidence} number={1} />,
      missing: <EvidenceChip number={1} />,
      loading: <EvidenceChip number={1} status="loading" />,
      error: <EvidenceChip number={1} status="error" />,
      text: "근거 1",
    },
    {
      name: "EvidenceCard",
      ready: <EvidenceCard evidence={evidence} number={1} defaultOpen />,
      missing: <EvidenceCard number={1} />,
      loading: <EvidenceCard number={1} status="loading" />,
      error: <EvidenceCard number={1} status="error" />,
      text: evidence.title,
    },
    {
      name: "FestivalCard",
      ready: <FestivalCard festival={festival} />,
      missing: <FestivalCard />,
      loading: <FestivalCard status="loading" />,
      error: <FestivalCard status="error" />,
      text: festival.name,
    },
    {
      name: "EventChipCard",
      ready: <EventChipCard event={report.event} />,
      missing: <EventChipCard />,
      loading: <EventChipCard status="loading" />,
      error: <EventChipCard status="error" />,
      text: report.event.name,
    },
    {
      name: "AskButtons",
      ready: <AskButtons draft={draft} />,
      missing: <AskButtons />,
      loading: <AskButtons status="loading" />,
      error: <AskButtons status="error" />,
      text: "예시 답변",
    },
    {
      name: "FactorList",
      ready: (
        <FactorList
          factors={report.forecast.factors}
          evidence={report.evidence}
        />
      ),
      missing: <FactorList />,
      loading: <FactorList status="loading" />,
      error: <FactorList status="error" />,
      text: "예보 요인",
    },
    {
      name: "SimilarEventCard",
      ready: <SimilarEventCard event={similar} />,
      missing: <SimilarEventCard />,
      loading: <SimilarEventCard status="loading" />,
      error: <SimilarEventCard status="error" />,
      text: similar.name,
    },
    {
      name: "InsightCard",
      ready: <InsightCard insight={insight} />,
      missing: <InsightCard />,
      loading: <InsightCard status="loading" />,
      error: <InsightCard status="error" />,
      text: "영종 행사 비교",
    },
    {
      name: "KpiTile",
      ready: <KpiTile ops={ops} metric="cases" />,
      missing: <KpiTile metric="cases" />,
      loading: <KpiTile metric="cases" status="loading" />,
      error: <KpiTile metric="cases" status="error" />,
      text: "평가 사례",
    },
    {
      name: "ChecklistItem",
      ready: (
        <ChecklistItem
          item={report.forecast.judgment.checklist[0]}
          evidence={report.evidence}
        />
      ),
      missing: <ChecklistItem />,
      loading: <ChecklistItem status="loading" />,
      error: <ChecklistItem status="error" />,
      text: report.forecast.judgment.checklist[0]?.text ?? "",
    },
    {
      name: "SourceTip",
      ready: <SourceTip evidence={evidence} />,
      missing: <SourceTip />,
      loading: <SourceTip status="loading" />,
      error: <SourceTip status="error" />,
      text: "출처",
    },
  ];

  it.each(cases)(
    "$name 값·빈 값·로딩·오류",
    ({ ready, missing, loading, error, text }) => {
      expect(renderToStaticMarkup(ready)).toContain(text);
      expect(renderToStaticMarkup(missing)).toContain("없어요");
      expect(renderToStaticMarkup(loading)).toContain("불러오는 중");
      expect(renderToStaticMarkup(error)).toContain('role="alert"');
    },
  );

  // 네 판정 등급과 참고용 상태가 색 이외의 아이콘·이름으로 구별된다.
  it.each([
    [1, "소규모"],
    [2, "수립 권고"],
    [3, "수립 대상"],
    [4, "대규모"],
  ] as const)("판정 %s의 이름과 아이콘", (level, label) => {
    const markup = renderToStaticMarkup(
      <LevelBadge judgment={{ level, label }} provisional />,
    );
    expect(markup).toContain(label);
    expect(markup).toContain("참고용");
    expect(markup).toContain("<svg");
  });

  // 사후집계가 추정치이면 실측이라는 머리말에도 추정 사실을 남긴다.
  it("유사 행사의 추정 표시", () => {
    const markup = renderToStaticMarkup(
      <SimilarEventCard
        event={{
          ...similar,
          measured: similar.measured && {
            ...similar.measured,
            estimated: true,
          },
        }}
      />,
    );
    expect(markup).toContain("실측 추정");
  });

  // 결과가 없는 화면과 오류 화면에도 펫과 행동 이름이 남는다.
  it("펫 상태 화면", () => {
    const empty = renderToStaticMarkup(
      <EmptyState action={<button type="button">행사 찾기</button>} />,
    );
    const error = renderToStaticMarkup(
      <ErrorState action={<button type="button">다시 시도</button>} />,
    );
    expect(empty).toContain("동네지기 · 대기");
    expect(empty).toContain("행사 찾기");
    expect(error).toContain("출처확인 · 오류");
    expect(error).toContain("다시 시도");
  });

  // 견본 페이지에서 모든 칩의 번호와 실제 카드 대상이 같은 예보서 번호표를 쓴다.
  it("예보서 근거 번호와 카드 연결", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <KitPage />
      </MemoryRouter>,
    );
    expect(markup).toContain('href="#evidence-ev-rule-internal-5000"');
    expect(markup).toContain('id="evidence-ev-rule-internal-5000"');
    expect(markup.match(/근거 4, 규정/g)).toHaveLength(2);
    expect(markup.match(/근거 7, 사례/g)).toHaveLength(2);
  });
});
