// 근거 카드 선택과 출발 칩으로 돌아가는 키보드 동작을 제공한다.
import type { Evidence, ForecastReport } from "@crowdcast/contracts/types";
import { useEffect, useRef, useState } from "react";
import { EvidenceCard } from "../../components/common/evidence-card";
import { FeaturePanel } from "../../components/common/feature-panel";
import type { OpenEvidence } from "../forecast-report/report-claims";

// 근거의 관측 ID와 출처가 모두 일치할 때만 관측 수치를 카드에 붙인다.
export function observationForEvidence(
  evidence: Evidence,
  observations: readonly ForecastReport["forecast"]["observations"][number][],
) {
  if (evidence.kind !== "data" || !evidence.source) return null;
  let summaryId: string | null = null;
  try {
    const summary: unknown = JSON.parse(evidence.summary);
    if (
      summary &&
      typeof summary === "object" &&
      "id" in summary &&
      typeof summary.id === "string"
    )
      summaryId = summary.id;
  } catch {
    // 일반 설명문에는 관측 ID가 없으므로 수치를 덧붙이지 않는다.
  }
  const matched = observations.filter(
    (item) =>
      item.datasetId === evidence.source?.datasetId &&
      (evidence.quantityIds.includes(item.id) || summaryId === item.id),
  );
  return matched.length === 1 ? matched[0] : null;
}

// 여러 곳의 같은 근거 칩 가운데 실제 출발 요소를 기억한다.
export function useEvidenceDrawer() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const open: OpenEvidence = (id, element) => {
    origin.current = element;
    setSelectedId(id);
    requestAnimationFrame(() => {
      const card = document.getElementById(`evidence-${id}`);
      if (card instanceof HTMLDetailsElement) card.open = true;
      const summary = card?.querySelector("summary");
      summary?.scrollIntoView({ block: "nearest" });
      summary?.focus();
    });
  };
  const close = () => {
    setSelectedId(null);
    origin.current?.scrollIntoView({ block: "center" });
    origin.current?.focus();
  };
  return { selectedId, open, close };
}

// 카드 선택 시 요약으로 이동하고 Escape는 출발 칩에 돌려준다.
export function ReportDrawer({
  report,
  selectedId,
  onClose,
}: {
  report: ForecastReport;
  selectedId: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!selectedId) return;
    const card = document.getElementById(`evidence-${selectedId}`);
    const summary = card?.querySelector("summary");
    summary?.scrollIntoView({ block: "nearest" });
    summary?.focus();
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [selectedId, onClose]);
  return (
    <div>
      <FeaturePanel
        id="M3-F2"
        title="근거 서랍"
        description="문장 끝 번호와 아래 카드 번호가 같아요."
        className="evidence-drawer"
      >
        {selectedId && (
          <div className="report-drawer-actions">
            <button type="button" onClick={onClose}>
              읽던 곳으로
            </button>
            <button type="button" onClick={onClose} aria-label="근거 서랍 닫기">
              닫기
            </button>
          </div>
        )}
        <div className="report-evidence-list">
          {report.evidence.map((evidence) => (
            <EvidenceCard
              key={evidence.id}
              evidence={evidence}
              evidenceOrder={report.evidence}
              defaultOpen={selectedId === evidence.id}
              highlighted={selectedId === evidence.id}
              hideProbability={report.forecast.judgment.basis === "구간"}
              context={{
                observation: observationForEvidence(
                  evidence,
                  report.forecast.observations,
                ),
                predictionRun: report.forecast.predictionRun,
                assumption: report.forecast.assumptions.find(
                  (item) => item.id === evidence.assumptionId,
                ),
                similar: report.similar.find(
                  (item) => item.eventId === evidence.caseEventId,
                ),
              }}
            />
          ))}
        </div>
      </FeaturePanel>
    </div>
  );
}
