// 오류 화면에 예보팀 펫과 다시 시도할 행동을 함께 보여 준다.
import type { ReactNode } from "react";
import { PetAvatar } from "../pets";

// 복구 방법을 오류 문장 옆에 두어 빈 화면으로 끝나지 않게 한다.
export function ErrorState({
  message = "자료를 불러오지 못했어요.",
  action,
}: {
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="kit-screen-state" role="alert">
      <PetAvatar agentId="source-check" state="error" size={96} />
      <p>{message}</p>
      {action ?? (
        <button type="button" onClick={() => window.location.reload()}>
          다시 시도
        </button>
      )}
    </div>
  );
}
