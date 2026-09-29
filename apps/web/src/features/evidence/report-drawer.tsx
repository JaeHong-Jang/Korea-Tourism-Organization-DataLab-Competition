// 근거 카드 선택과 출발 칩으로 돌아가는 키보드 동작을 제공한다.
import type { Evidence, ForecastReport } from "@crowdcast/contracts/types";
import { useEffect, useRef, useState } from "react";
import { EvidenceCard } from "../../components/common/evidence-card";
import { evidenceNumber } from "../../components/common/evidence-number";
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
  // 서랍 카드로 옮기는 포커스는 다음 프레임에 예약되므로, 그 전에 닫히면 예약을 취소한다.
  const pendingFocus = useRef(0);
  const open: OpenEvidence = (id, element) => {
    cancelAnimationFrame(pendingFocus.current);
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    origin.current = element;
    setSelectedId(id);
    pendingFocus.current = requestAnimationFrame(() => {
      const card = document.getElementById(`evidence-${id}`);
      const summary = card?.querySelector("summary");
      const scroller = card?.closest<HTMLElement>(".evidence-drawer");
      if (scroller) scroller.scrollTop = 0;
      summary?.focus({ preventScroll: true });
    });
  };
  const deselect = () => {
    cancelAnimationFrame(pendingFocus.current);
    setSelectedId(null);
  };
  const close = () => {
    cancelAnimationFrame(pendingFocus.current);
    setSelectedId(null);
    origin.current?.scrollIntoView({ block: "center" });
    origin.current?.focus();
  };
  return { selectedId, open, close, deselect };
}

// 선택한 근거를 서랍 맨 위에 펼치고 Escape는 출발 번호로 돌려준다.
export function ReportDrawer({
  report,
  selectedId,
  onClose,
  onDeselect,
}: {
  report: ForecastReport;
  selectedId: string | null;
  onClose: () => void;
  onDeselect: () => void;
}) {
  const selected = report.evidence.find((item) => item.id === selectedId);
  const ordered = selected
    ? [selected, ...report.evidence.filter((item) => item.id !== selectedId)]
    : report.evidence;
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
    <aside className="report-drawer-slot" aria-label="근거 서랍">
      <FeaturePanel id="M3-F2" title="근거 서랍" className="evidence-drawer">
        {selectedId && (
          <div className="report-drawer-actions">
            <button type="button" onClick={onClose}>
              읽던 곳으로
            </button>
            <button type="button" onClick={onDeselect}>
              선택 해제
            </button>
          </div>
        )}
        {selected && (
          <p className="report-drawer-selection" role="status">
            선택한 근거 [{evidenceNumber(selected.id, report.evidence)}]
          </p>
        )}
        <div className="report-evidence-list">
          {ordered.map((evidence) => (
            <EvidenceCard
              key={evidence.id}
              evidence={evidence}
              evidenceOrder={report.evidence}
              defaultOpen={selectedId === evidence.id}
              highlighted={selectedId === evidence.id}
              onToggle={(open) => {
                if (!open && selectedId === evidence.id) onDeselect();
              }}
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
    </aside>
  );
}
