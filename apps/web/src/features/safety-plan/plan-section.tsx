// 계획 섹션의 발행 본문·잠금 수치·작성자 메모를 분리한다.
import type { ForecastReport, Plan } from "@crowdcast/contracts/types";
import { LockKeyhole } from "lucide-react";
import { EvidenceChip } from "../../components/common/evidence-chip";
import type { OpenEvidence } from "../forecast-report/report-claims";

// 발행 문장은 원문 순서로 근거 칩을 붙이고 메모만 입력받는다.
export function PlanSection({
  section,
  index,
  report,
  note,
  onNote,
  onOpen,
}: {
  section: Plan["sections"][number];
  index: number;
  report: ForecastReport;
  note: string;
  onNote: (index: number, value: string) => void;
  onOpen: OpenEvidence;
}) {
  const claims = new Map(report.claims.map((claim) => [claim.id, claim]));
  const evidence = new Map(report.evidence.map((item) => [item.id, item]));
  return (
    <section className="plan-section" id={`plan-${section.key}`}>
      <div className="plan-section__heading">
        <h2 tabIndex={-1} id={`plan-heading-${section.key}`}>
          {index + 1}. {section.title}
        </h2>
        <span className="plan-status">{section.status}</span>
      </div>
      <div className="plan-published">
        <h3>발행 문장 · 읽기 전용</h3>
        {section.claimIds.length ? (
          section.claimIds.map((id) => {
            const claim = claims.get(id);
            if (!claim) return <p key={id}>발행 문장을 확인할 수 없어요.</p>;
            return (
              <p key={id}>
                {claim.rendered}{" "}
                {claim.evidenceIds.map((evidenceId) => {
                  const item = evidence.get(evidenceId);
                  return item ? (
                    <EvidenceChip
                      key={evidenceId}
                      evidence={item}
                      evidenceOrder={report.evidence}
                      onOpen={onOpen}
                      hideProbability={
                        report.forecast.judgment.basis === "구간"
                      }
                    />
                  ) : null;
                })}
              </p>
            );
          })
        ) : (
          <p>이 섹션에 연결된 발행 문장이 없어요.</p>
        )}
        {section.lockedFields.length > 0 && (
          <div className="plan-locked">
            {section.lockedFields.map((field) => (
              <span
                className="plan-locked__chip"
                key={`${field.quantityId}-${field.name}`}
              >
                <LockKeyhole size={14} aria-hidden="true" />
                <span>
                  {field.name} · {field.value}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
      <label className="plan-notes" htmlFor={`notes-${section.key}`}>
        <strong>작성자 메모 — 근거 없음</strong>
        <textarea
          id={`notes-${section.key}`}
          value={note}
          maxLength={4000}
          rows={4}
          placeholder="현장에서 확인할 내용이나 담당자 메모를 적어 주세요."
          onChange={(event) => onNote(index, event.target.value)}
        />
      </label>
    </section>
  );
}
