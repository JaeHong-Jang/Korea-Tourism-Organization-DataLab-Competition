// 계약 수치의 중앙값과 구간, 단위와 근거를 한 묶음으로 보여 준다.
import type { Evidence, ForecastCard } from "@crowdcast/contracts/types";
import { formatQuantity, representativeValue } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";
import { EvidenceChip } from "./evidence-chip";
import { SourceTip } from "./source-tip";

// 애니메이션으로 중간 숫자를 만들지 않아 원본 예보값만 표시한다.
export function KeyNumber({
  quantity,
  evidence,
  evidenceNumber = 1,
  evidenceOrder,
  status = "ready",
}: {
  quantity?: ForecastCard["peakConcurrent"] | ForecastCard["dailyMean"] | null;
  evidence?: Evidence | null;
  evidenceNumber?: number;
  evidenceOrder?: readonly Evidence[];
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !quantity)
    return (
      <ComponentState
        name="핵심 수치"
        status={status === "ready" ? "empty" : status}
      />
    );
  const value = representativeValue(quantity);
  if (value == null) return <ComponentState name="핵심 수치" status="empty" />;
  return (
    <div className="key-number">
      <span className="kit-label">{quantity.name}</span>
      <strong>{formatQuantity(value, quantity.unit)}</strong>
      <small>{formatQuantity(quantity, "detail")}</small>
      {evidence && (
        <span className="kit-evidence-links">
          <EvidenceChip
            evidence={evidence}
            number={evidenceNumber}
            evidenceOrder={evidenceOrder}
          />
          <SourceTip evidence={evidence} />
        </span>
      )}
    </div>
  );
}
