// 상담에서 확인한 행사 계약의 핵심 항목을 짧은 카드로 모은다.
import type { Event, EventDraft } from "@crowdcast/contracts/types";
import { formatDate, formatQuantity } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";

// 초안의 미확인 항목은 값이 있는 것처럼 채우지 않는다.
export function EventChipCard({
  event,
  status = "ready",
}: {
  event?: Event | EventDraft | null;
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !event)
    return (
      <ComponentState
        name="행사 정보"
        status={status === "ready" ? "empty" : status}
      />
    );
  return (
    <article className="kit-card event-chip-card" aria-label="행사 정보">
      <h3>{event.name || "행사 이름 확인 중"}</h3>
      <div className="kit-chips">
        {event.type && <span>{event.type}</span>}
        {event.startsAt && <span>{formatDate(event.startsAt)}</span>}
        {event.sigunguName && <span>{event.sigunguName}</span>}
        {"expectedByHost" in event && event.expectedByHost?.value != null && (
          <span>주최측 예상 {formatQuantity(event.expectedByHost)}</span>
        )}
      </div>
    </article>
  );
}
