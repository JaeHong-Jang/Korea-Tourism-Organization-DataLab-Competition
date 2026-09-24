// 실제 한국 행사 견본으로 도메인 부품의 낮·밤 모양을 확인한다.
import type {
  Evidence,
  FestivalSummary,
  ForecastReport,
  Insight,
  OpsStatus,
  SimilarEvent,
} from "@crowdcast/contracts/types";
import evidenceFixture from "../../../../../packages/contracts/fixtures/evidence/valid-data.json";
import festivalFixture from "../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import reportFixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import opsFixture from "../../../../../packages/contracts/fixtures/ops-status/valid-example.json";
import similarFixture from "../../../../../packages/contracts/fixtures/similar-event/valid-yeongjong-2024.json";
import { RangeBar } from "../../components/charts/range-bar";
import { AskButtons } from "../../components/common/ask-buttons";
import { ChecklistItem } from "../../components/common/checklist-item";
import { EmptyState } from "../../components/common/empty-state";
import { ErrorState } from "../../components/common/error-state";
import { EventChipCard } from "../../components/common/event-chip-card";
import { EvidenceCard } from "../../components/common/evidence-card";
import { FactorList } from "../../components/common/factor-list";
import { FestivalCard } from "../../components/common/festival-card";
import { InsightCard } from "../../components/common/insight-card";
import { KeyNumber } from "../../components/common/key-number";
import { KpiTile } from "../../components/common/kpi-tile";
import { LevelBadge } from "../../components/common/level-badge";
import { PageHeading } from "../../components/common/page-heading";
import { SimilarEventCard } from "../../components/common/similar-event-card";
import { SourceTip } from "../../components/common/source-tip";
import "../../components/common/kit.css";
import "./kit-page.css";

const report = reportFixture as unknown as ForecastReport;
const festival = festivalFixture as FestivalSummary;
const evidence = evidenceFixture as Evidence;
const similar = similarFixture as unknown as SimilarEvent;
const ops = opsFixture as unknown as OpsStatus;
const modelEvidence = report.evidence.find((item) => item.kind === "model");
const ruleEvidence = report.evidence.find((item) => item.kind === "rule");
const internalRuleEvidence = report.evidence.find(
  (item) => item.id === "ev-rule-internal-5000",
);
const assumptionEvidence = report.evidence.find(
  (item) => item.kind === "assumption",
);
const otherAssumptionEvidence = report.evidence.find(
  (item) => item.kind === "assumption" && item.id !== assumptionEvidence?.id,
);
const checkEvidence: Evidence | null = modelEvidence
  ? {
      ...modelEvidence,
      id: "ev-check-demo",
      kind: "check",
      title: "숫자 검증 견본",
      summary: "예보서의 숫자와 근거를 대조했어요.",
      modelVersion: null,
      checkResult: {
        checkKind: "number",
        passed: true,
        revision: report.revision,
      },
      availableAt: report.publishedAt.slice(0, 10),
    }
  : null;
const evidenceOrder = [
  ...report.evidence,
  ...similar.evidence,
  ...(checkEvidence ? [checkEvidence] : []),
];
const insight: Insight = {
  key: "I1",
  title: "영종 씨사이드파크 불꽃축제 예보",
  headline: {
    value: festival.peakP50,
    unit: "명",
    text: "예보된 순간 최대 인원이에요.",
  },
  sampleSize: 1,
  comparablePairs: null,
  period: { from: "2025-10-18", to: "2025-10-18" },
  series: [],
  evidenceIds: [evidence.id],
  evidence: [evidence],
  computedAt: report.card.asOf,
};

// 번호와 계약값을 실제 예보서 견본에서 받아 모든 주요 부품을 한 번씩 그린다.
export function KitPage() {
  return (
    <div className="page-wrap regular-page kit-page">
      <PageHeading
        eyebrow="화면 부품"
        title="부품 견본"
        description="행사 예보에 쓰는 수치와 근거, 상태를 확인해요."
      />
      <div className="kit-layout">
        <section className="kit-hero" aria-label="핵심 예보">
          <span className="kit-label">영종 씨사이드파크 불꽃축제</span>
          <div className="kit-hero__row">
            <KeyNumber
              quantity={report.card.peakConcurrent}
              evidence={evidence}
              evidenceOrder={evidenceOrder}
            />
            <LevelBadge
              judgment={report.card.judgment}
              probability={festival.pOver1000}
            />
          </div>
          <RangeBar
            range={report.card.peakConcurrent}
            hostExpected={report.event.expectedByHost}
          />
        </section>
        <section className="kit-column" aria-label="행사와 근거">
          <FestivalCard festival={festival} />
          <EventChipCard event={report.event} />
          <SourceTip evidence={evidence} />
        </section>
        <section className="kit-column" aria-label="비교와 준비">
          <SimilarEventCard event={similar} evidenceOrder={evidenceOrder} />
          <FactorList
            factors={report.forecast.factors}
            evidence={report.evidence}
            evidenceOrder={evidenceOrder}
          />
          <ChecklistItem
            item={report.forecast.judgment.checklist[0]}
            evidence={report.evidence}
            evidenceOrder={evidenceOrder}
          />
          <AskButtons
            draft={{
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
            }}
          />
        </section>
        <section className="kit-column" aria-label="다른 상태">
          <InsightCard insight={insight} evidenceOrder={evidenceOrder} />
          <KpiTile ops={ops} metric="cases" />
          <InsightCard status="loading" />
          <EmptyState action={<button type="button">행사 찾아보기</button>} />
          <ErrorState action={<button type="button">다시 시도</button>} />
        </section>
      </div>
      <section
        className="kit-evidence-gallery"
        aria-label="근거 카드 여섯 종류"
      >
        <h2>근거 카드</h2>
        <div className="kit-evidence-gallery__grid">
          <EvidenceCard
            evidence={evidence}
            evidenceOrder={evidenceOrder}
            context={{ observation: report.forecast.observations[0] }}
            defaultOpen
          />
          {modelEvidence && (
            <EvidenceCard
              evidence={modelEvidence}
              evidenceOrder={evidenceOrder}
              context={{ predictionRun: report.forecast.predictionRun }}
              defaultOpen
            />
          )}
          {ruleEvidence && (
            <EvidenceCard
              evidence={ruleEvidence}
              evidenceOrder={evidenceOrder}
              context={{ ruleKind: "법정" }}
              defaultOpen
            />
          )}
          {internalRuleEvidence && (
            <EvidenceCard
              evidence={internalRuleEvidence}
              evidenceOrder={evidenceOrder}
              context={{ ruleKind: "자체" }}
              defaultOpen
            />
          )}
          <EvidenceCard
            evidence={similar.evidence[0]}
            evidenceOrder={evidenceOrder}
            context={{ similar }}
            defaultOpen
          />
          {assumptionEvidence && (
            <EvidenceCard
              evidence={assumptionEvidence}
              evidenceOrder={evidenceOrder}
              context={{ assumption: report.forecast.assumptions[0] }}
              defaultOpen
            />
          )}
          {otherAssumptionEvidence && (
            <EvidenceCard
              evidence={otherAssumptionEvidence}
              evidenceOrder={evidenceOrder}
              context={{ assumption: report.forecast.assumptions[1] }}
              defaultOpen
            />
          )}
          {checkEvidence && (
            <EvidenceCard
              evidence={checkEvidence}
              evidenceOrder={evidenceOrder}
              defaultOpen
            />
          )}
        </div>
      </section>
    </div>
  );
}
