// 예보 요인 계약의 방향과 근거 연결을 목록으로 보여 준다.
import type { Evidence, Factor } from "@crowdcast/contracts/types";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPercent } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";
import { EvidenceChip } from "./evidence-chip";

// 기여도 숫자를 재해석하지 않고 방향·설명·근거 ID를 함께 둔다.
export function FactorList({
  factors,
  evidence = [],
  evidenceOrder,
  status = "ready",
}: {
  factors?: Factor[] | null;
  evidence?: Evidence[];
  evidenceOrder?: readonly Evidence[];
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !factors?.length)
    return (
      <ComponentState
        name="예보 요인"
        status={status === "ready" ? "empty" : status}
      />
    );
  if (
    factors.some((factor) =>
      factor.evidenceIds.some((id) => !evidence.some((item) => item.id === id)),
    )
  )
    return <ComponentState name="예보 요인 근거" status="error" />;
  return (
    <ul className="factor-list" aria-label="예보 요인">
      {factors.map((factor) => (
        <li key={factor.id}>
          <span className="factor-list__direction">
            {factor.direction === "up" ? (
              <ArrowUpRight size={17} aria-hidden="true" />
            ) : (
              <ArrowDownRight size={17} aria-hidden="true" />
            )}
            {factor.direction === "up" ? "증가" : "감소"}
          </span>
          <strong>{factor.feature}</strong>
          <p>{factor.label}</p>
          <small>
            기여 {formatPercent(factor.contribution)}{" "}
            {factor.evidenceIds.map((id) => {
              const item = evidence.find((entry) => entry.id === id);
              return item ? (
                <EvidenceChip
                  key={id}
                  evidence={item}
                  evidenceOrder={evidenceOrder ?? evidence}
                />
              ) : null;
            })}
          </small>
        </li>
      ))}
    </ul>
  );
}
