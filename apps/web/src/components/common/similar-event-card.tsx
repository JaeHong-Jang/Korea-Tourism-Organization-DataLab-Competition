// 과거 유사 행사 계약의 실측과 발표를 단위 비교 가능성과 함께 보여 준다.
import type { Evidence, SimilarEvent } from "@crowdcast/contracts/types";
import { formatPercent, formatQuantity } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";
import { EvidenceChip } from "./evidence-chip";
import { SourceTip } from "./source-tip";

// 값의 단위가 다르면 차이를 만들지 않고 원본 두 수치만 나란히 둔다.
export function SimilarEventCard({
  event,
  evidenceOrder,
  status = "ready",
}: {
  event?: SimilarEvent | null;
  evidenceOrder?: readonly Evidence[];
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !event)
    return (
      <ComponentState
        name="유사 행사"
        status={status === "ready" ? "empty" : status}
      />
    );
  const evidence = event.evidence.find((item) => item.id === event.evidenceId);
  if (!evidence) return <ComponentState name="유사 행사 근거" status="error" />;
  return (
    <article
      className="kit-card similar-event-card"
      aria-label={`${event.year} ${event.name}`}
    >
      <span className="kit-label">
        {event.year} · {event.sigunguName}
      </span>
      <h3>{event.name}</h3>
      <dl>
        <div>
          <dt>{event.measured?.estimated ? "실측 추정" : "실측"}</dt>
          <dd>
            {event.measured?.value == null
              ? "자료 없음"
              : formatQuantity(event.measured)}
          </dd>
        </div>
        <div>
          <dt>발표</dt>
          <dd>
            {event.announced?.value == null
              ? "자료 없음"
              : formatQuantity(event.announced)}
          </dd>
        </div>
      </dl>
      <p>
        {event.unitsComparable
          ? "같은 단위로 비교할 수 있어요."
          : "집계 단위가 달라 직접 비교하지 않아요."}
      </p>
      <small>
        유사도 {formatPercent(event.similarity)}{" "}
        {evidence && (
          <>
            <EvidenceChip
              evidence={evidence}
              evidenceOrder={evidenceOrder ?? event.evidence}
            />
            <SourceTip evidence={evidence} />
          </>
        )}
      </small>
    </article>
  );
}
