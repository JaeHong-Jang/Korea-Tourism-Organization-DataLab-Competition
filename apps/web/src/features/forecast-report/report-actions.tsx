// 준비 항목과 다음 할 일을 발행 스냅샷의 참조만으로 표시한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { useState } from "react";
import { EvidenceChip } from "../../components/common/evidence-chip";
import { ClaimLine, type OpenEvidence } from "./report-claims";
import { claimText, orderedClaims } from "./report-content";

// 같은 항목이 권고 문장·체크리스트·다음 할 일에 겹쳐 있으면 체크리스트 한 번만 보인다.
const same = (text: string) => text.replace(/\s+/g, " ").trim();

// 체크리스트 항목은 눌러서 확인 표시(배경)를 켜고 끈다. 저장하지 않는 화면 표시다.
export function ReportActions({
  report,
  onOpen,
}: {
  report: ForecastReport;
  onOpen: OpenEvidence;
}) {
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const checklist = report.forecast.judgment.checklist;
  const listed = new Set(checklist.map((item) => same(item.text)));
  const recommendations = orderedClaims(report).filter(
    (claim) =>
      claim.claimType === "권고" && !listed.has(same(claimText(claim, report))),
  );
  const actions = report.brief.actions.filter(
    (action) => !listed.has(same(action.label)),
  );
  const byId = new Map(report.evidence.map((item) => [item.id, item]));
  const toggle = (id: string) =>
    setDone((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      {!recommendations.length && !checklist.length && (
        <p>준비 항목 자료 없음</p>
      )}
      <ul className="report-checklist">
        {checklist.map((item) => (
          <li key={item.id} className={done.has(item.id) ? "is-done" : ""}>
            <button
              type="button"
              className="report-checklist__item"
              aria-pressed={done.has(item.id)}
              onClick={() => toggle(item.id)}
            >
              {item.text}
            </button>
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
      {actions.length > 0 && (
        <div className="report-next">
          <h3>다음 할 일</h3>
          <ul>
            {actions.map((action) => (
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
      )}
    </section>
  );
}
