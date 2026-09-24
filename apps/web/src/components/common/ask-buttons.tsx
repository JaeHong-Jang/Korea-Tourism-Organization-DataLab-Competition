// 상담에서 계약의 행사 항목을 채울 수 있는 예시 응답 버튼을 둔다.
import type { EventDraft } from "@crowdcast/contracts/types";
import { ComponentState, type ComponentStatus } from "./component-state";

// 현재 초안에 없는 필드의 예시만 보여 주고 선택값을 상위 화면에 전달한다.
export function AskButtons({
  draft,
  onChoose,
  status = "ready",
}: {
  draft?: EventDraft | null;
  onChoose?: (text: string) => void;
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !draft)
    return (
      <ComponentState
        name="예시 답변"
        status={status === "ready" ? "empty" : status}
      />
    );
  const suggestions = [
    !draft.sigunguName && "인천 중구에서 열려요",
    !draft.startsAt && "10월 18일 19시에 시작해요",
    !draft.type && "불꽃축제예요",
  ].filter((item): item is string => Boolean(item));
  if (!suggestions.length)
    return <ComponentState name="예시 답변" status="empty" />;
  return (
    <fieldset className="ask-buttons" aria-label="예시 답변">
      {suggestions.map((item) => (
        <button key={item} type="button" onClick={() => onChoose?.(item)}>
          {item}
        </button>
      ))}
    </fieldset>
  );
}
