// 비어 있는 화면에 예보팀 펫과 다음 행동을 함께 보여 준다.
import type { ReactNode } from "react";
import { PetAvatar } from "../pets";

// 안내 문장을 하나로 유지해 비어 있는 이유와 행동을 쉽게 읽게 한다.
export function EmptyState({
  message = "아직 보여 줄 행사가 없어요.",
  action,
}: {
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="kit-screen-state" role="status">
      <PetAvatar agentId="local-guide" state="idle" size={96} />
      <p>{message}</p>
      {action ?? <a href="/consult">예보 상담 열기</a>}
    </div>
  );
}
