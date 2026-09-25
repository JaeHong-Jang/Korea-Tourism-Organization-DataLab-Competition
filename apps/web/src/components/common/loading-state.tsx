// 자료를 기다리는 화면에 펫과 다음 이동 경로를 함께 보여 준다.
import type { ReactNode } from "react";
import { PetAvatar } from "../pets";

// 기다리는 동안에도 사용자가 다른 메뉴로 이동할 수 있게 한다.
export function LoadingState({
  message = "자료를 불러오는 중이에요.",
  action,
}: {
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="kit-screen-state" role="status">
      <PetAvatar agentId="local-guide" state="working" size={96} />
      <p>{message}</p>
      {action ?? <a href="/consult">예보 상담 열기</a>}
    </div>
  );
}
