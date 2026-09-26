// 발행 문장을 원래 레이아웃 순서와 근거 칩으로 표시한다.
import type { Claim, ForecastReport } from "@crowdcast/contracts/types";
import { EvidenceChip } from "../../components/common/evidence-chip";
import { claimText, orderedClaims } from "./report-content";

export type OpenEvidence = (id: string, origin: HTMLElement) => void;

// 한 문장의 모든 근거를 같은 번호표에서 찾아 붙인다.
export function ClaimLine({
  claim,
  report,
  onOpen,
}: {
  claim: Claim;
  report: ForecastReport;
  onOpen: OpenEvidence;
}) {
  const evidence = new Map(report.evidence.map((item) => [item.id, item]));
  return (
    <p className="report-claim">
      {claimText(claim, report)}{" "}
      {claim.evidenceIds.map((id) => {
        const item = evidence.get(id);
        return item ? (
          <EvidenceChip
            key={id}
            evidence={item}
            evidenceOrder={report.evidence}
            onOpen={onOpen}
            hideProbability={report.forecast.judgment.basis === "구간"}
          />
        ) : null;
      })}
    </p>
  );
}

// 판정과 권고도 다른 설명 문장과 같은 근거 규칙으로 표시한다.
export function ReportClaims({
  report,
  onOpen,
  exclude = [],
}: {
  report: ForecastReport;
  onOpen: OpenEvidence;
  exclude?: Claim["claimType"][];
}) {
  const claims = orderedClaims(report).filter(
    (claim) => !exclude.includes(claim.claimType),
  );
  return (
    <section
      className="report-section report-explanations"
      aria-labelledby="report-claims-title"
    >
      <h3 id="report-claims-title">예보 설명</h3>
      {claims.length ? (
        claims.map((claim) => (
          <ClaimLine
            key={claim.id}
            claim={claim}
            report={report}
            onOpen={onOpen}
          />
        ))
      ) : (
        <p>발행된 설명이 없어요.</p>
      )}
    </section>
  );
}
