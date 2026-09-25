// 준비 항목과 다음 할 일을 발행 스냅샷의 참조만으로 표시한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { EvidenceChip } from "../../components/common/evidence-chip";
import { ClaimLine, type OpenEvidence } from "./report-claims";
import { orderedClaims } from "./report-content";

// 권고 문장과 판정 체크리스트 모두 인용 근거를 함께 둔다.
export function ReportActions({
  report,
  onOpen,
}: {
  report: ForecastReport;
  onOpen: OpenEvidence;
}) {
  const recommendations = orderedClaims(report).filter(
    (claim) => claim.claimType === "권고",
  );
  const byId = new Map(report.evidence.map((item) => [item.id, item]));
  return (
    <section
      className="report-section report-actions"
      aria-labelledby="report-checklist-title"
    >
      <h3 id="report-checklist-title">준비 체크리스트</h3>
      {recommendations.map((claim) => (
        <ClaimLine
          key={claim.id}
          claim={claim}
          report={report}
          onOpen={onOpen}
        />
      ))}
      {!recommendations.length &&
        !report.forecast.judgment.checklist.length && (
          <p>준비 항목 자료 없음</p>
        )}
      <ul className="report-checklist">
        {report.forecast.judgment.checklist.map((item) => (
          <li key={item.id}>
            <label>
              <input type="checkbox" /> {item.text}
            </label>{" "}
            {item.evidenceIds.map((id) => {
              const evidence = byId.get(id);
              return evidence ? (
                <EvidenceChip
                  key={id}
                  evidence={evidence}
                  evidenceOrder={report.evidence}
                  onOpen={onOpen}
                  hideProbability={report.forecast.judgment.basis === "구간"}
                />
              ) : null;
            })}
          </li>
        ))}
      </ul>
      <div className="report-next">
        <h3>다음 할 일</h3>
        {!report.brief.actions.length && <p>다음 할 일이 아직 없어요.</p>}
        <ul>
          {report.brief.actions.map((action) => (
            <li key={action.id}>
              {action.href ? (
                <a href={action.href}>{action.label}</a>
              ) : (
                action.label
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
