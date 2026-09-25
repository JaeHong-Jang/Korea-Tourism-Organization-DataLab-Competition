// 행사 정보와 발행 판정 사유를 예보서 첫머리에 둔다.

import masterLabels from "@crowdcast/contracts/jsonld/master-labels.json";
import type { ForecastReport } from "@crowdcast/contracts/types";
import { EvidenceChip } from "../../components/common/evidence-chip";
import { LevelBadge } from "../../components/common/level-badge";
import { formatDate } from "../../lib/format";
import { ClaimLine, type OpenEvidence } from "./report-claims";
import { orderedClaims } from "./report-content";

export const UNVERIFIED_NOTICE = "골든 사례 0건 — 사례 재현 검증 전 임시 사용";
export const SIZE_BIAS_NOTICE =
  "학습 자료가 큰 행사 위주라 작은 행사는 크게 예보될 수 있어요";

// 규칙의 법정·자체 구분과 발행된 판정 문장을 함께 남긴다.
export function ReportJudgment({
  report,
  onOpen,
}: {
  report: ForecastReport;
  onOpen: OpenEvidence;
}) {
  const claims = orderedClaims(report).filter(
    (claim) => claim.claimType === "판정",
  );
  const evidence = new Map(report.evidence.map((item) => [item.id, item]));
  const interval = report.forecast.judgment.basis === "구간";
  return (
    <>
      <header className="report-event">
        <span className="kit-label">
          {report.event.type} · {report.event.sigunguName}
        </span>
        <h3>{report.event.name}</h3>
        <p>
          {formatDate(report.event.startsAt)} ~{" "}
          {formatDate(report.event.endsAt)} · {report.event.venue.name}
        </p>
        <small>
          발행 {formatDate(report.publishedAt)} · 참고용 — 담당자 검토 필수
        </small>
      </header>
      <section
        className="report-judgment report-section"
        aria-labelledby="report-judgment-title"
      >
        <h3 id="report-judgment-title">안전관리 판정</h3>
        <LevelBadge judgment={report.forecast.judgment} />
        {interval && <p>표본 한계로 구간 기준 표시</p>}
        {report.forecast.predictionRun.modelVerdict === "미검증" && (
          <div className="report-notices" role="note">
            <p>{UNVERIFIED_NOTICE}</p>
            <p>{SIZE_BIAS_NOTICE}</p>
          </div>
        )}
        {claims.map((claim) => (
          <ClaimLine
            key={claim.id}
            claim={claim}
            report={report}
            onOpen={onOpen}
          />
        ))}
        <ul className="report-reasons">
          {report.forecast.judgment.reasons.map((reason) => {
            const ruleId = String(reason.ruleId ?? "");
            const rule =
              masterLabels.rules[ruleId as keyof typeof masterLabels.rules];
            const linked = evidence.get(String(reason.evidenceId ?? ""));
            return (
              <li key={ruleId}>
                <b>{rule?.kind ?? String(reason.kind ?? "기준")}</b>{" "}
                {interval && String(reason.text ?? "").includes("%")
                  ? (rule?.title ?? ruleId)
                  : String(reason.text ?? rule?.title ?? "")}
                {linked && (
                  <EvidenceChip
                    evidence={linked}
                    evidenceOrder={report.evidence}
                    onOpen={onOpen}
                    hideProbability={interval}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
