// 운영 계약의 검증 건수를 이름과 단위가 있는 작은 지표로 보여 준다.
import type { OpsStatus } from "@crowdcast/contracts/types";
import { formatQuantity } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";

// 운영 화면은 이미 집계된 계약 필드만 골라 출력한다.
export function KpiTile({
  ops,
  metric,
  status = "ready",
}: {
  ops?: OpsStatus | null;
  metric: "cases" | "unsupportedPublished" | "numberMismatch" | "masterTriples";
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !ops)
    return (
      <ComponentState
        name="운영 지표"
        status={status === "ready" ? "empty" : status}
      />
    );
  const labels = {
    cases: "평가 사례",
    unsupportedPublished: "근거 없는 문장",
    numberMismatch: "수치 불일치",
    masterTriples: "근거 연결",
  };
  const value =
    metric === "masterTriples" ? ops.graph.masterTriples : ops.evals?.[metric];
  if (value == null)
    return <ComponentState name={labels[metric]} status="empty" />;
  return (
    <article
      className="kit-card kpi-tile"
      aria-label={`${labels[metric]} ${formatQuantity(value, "건")}`}
    >
      <span className="kit-label">{labels[metric]}</span>
      <strong>{formatQuantity(value, "건")}</strong>
    </article>
  );
}
