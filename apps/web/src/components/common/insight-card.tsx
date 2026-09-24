// 진단 지표 계약의 핵심 수치와 표본·기간·근거를 함께 보여 준다.
import type { Evidence, Insight } from "@crowdcast/contracts/types";
import { formatQuantity } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";
import { EvidenceChip } from "./evidence-chip";
import { SourceTip } from "./source-tip";

// 지표의 설명은 계약의 headline.text를 그대로 사용한다.
export function InsightCard({
  insight,
  evidenceOrder,
  status = "ready",
}: {
  insight?: Insight | null;
  evidenceOrder?: readonly Evidence[];
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !insight)
    return (
      <ComponentState
        name="인사이트"
        status={status === "ready" ? "empty" : status}
      />
    );
  const linkedEvidence = insight.evidenceIds
    .map((id) => insight.evidence.find((item) => item.id === id))
    .filter((item): item is Evidence => item != null);
  if (linkedEvidence.length !== insight.evidenceIds.length)
    return <ComponentState name="인사이트 근거" status="error" />;
  return (
    <article className="kit-card insight-card" aria-label={insight.title}>
      <span className="kit-label">{insight.key}</span>
      <h3>{insight.title}</h3>
      <strong>
        {formatQuantity(insight.headline.value, insight.headline.unit)}
      </strong>
      <span className="kit-evidence-links">
        {linkedEvidence.map((item) => (
          <span key={item.id}>
            <EvidenceChip
              evidence={item}
              evidenceOrder={evidenceOrder ?? insight.evidence}
            />
            <SourceTip evidence={item} />
          </span>
        ))}
      </span>
      <p>{insight.headline.text}</p>
      <small>
        표본 {formatQuantity(insight.sampleSize, "건")} · {insight.period.from}{" "}
        ~ {insight.period.to}
      </small>
    </article>
  );
}
