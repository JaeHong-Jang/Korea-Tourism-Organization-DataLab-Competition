// 계약 수치의 중앙값과 구간, 단위와 근거를 한 묶음으로 보여 준다.
import type { Claim, Evidence, ForecastCard } from "@crowdcast/contracts/types";
import { evidenceForQuantity } from "../../lib/evidence-for-quantity";
import { formatQuantity, representativeValue } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";
import { EvidenceChip } from "./evidence-chip";

// 애니메이션으로 중간 숫자를 만들지 않아 원본 예보값만 표시한다.
export function KeyNumber({
  quantity,
  claims = [],
  evidence,
  evidenceOrder,
  onOpen,
  status = "ready",
}: {
  quantity?: ForecastCard["peakConcurrent"] | ForecastCard["dailyMean"] | null;
  claims?: readonly Claim[];
  evidence?: readonly Evidence[];
  evidenceOrder?: readonly Evidence[];
  onOpen?: (id: string) => void;
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
  const linkedEvidence = evidenceForQuantity(
    claims,
    evidence ?? [],
    quantity.id,
  );
  return (
    <div className="key-number">
      <span className="kit-label">{quantity.name}</span>
      <strong>{formatQuantity(value, quantity.unit)}</strong>
      <small>{formatQuantity(quantity, "detail")}</small>
      {linkedEvidence.length > 0 && (
        <span className="kit-evidence-links">
          {linkedEvidence.map((item) => (
            <EvidenceChip
              key={item.id}
              evidence={item}
              evidenceOrder={evidenceOrder ?? linkedEvidence}
              onOpen={onOpen}
            />
          ))}
        </span>
      )}
    </div>
  );
}
