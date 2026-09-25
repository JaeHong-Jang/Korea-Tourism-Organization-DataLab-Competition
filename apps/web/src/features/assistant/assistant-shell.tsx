// 모든 화면에 고래 봇을 띄우고 상담 화면에서는 대화 서랍을 연다.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  useAssistantStore,
  useSharedConsultSession,
} from "../../lib/consult-store";
import { AssistantGuide } from "./assistant-guide";
import { AssistantPanel } from "./assistant-panel";
import { FloatingWhale } from "./floating-whale";

const invitationKey = "crowdcast:assistant:invitation-dismissed";

// 저장소를 못 읽어도 처음 방문 안내는 사용할 수 있다.
function wasDismissed() {
  try {
    return window.localStorage.getItem(invitationKey) === "yes";
  } catch {
    return false;
  }
}

// 라우트 진입 때만 자동으로 열고 사용자가 닫은 상태는 현재 화면에서 존중한다.
export function AssistantShell() {
  const location = useLocation();
  const open = useAssistantStore((state) => state.open);
  const openPanel = useAssistantStore((state) => state.openPanel);
  const { busy, forecastId } = useSharedConsultSession();
  const [invitation, setInvitation] = useState(() => !wasDismissed());
  const [guideOpen, setGuideOpen] = useState(false);
  const dismiss = () => {
    setInvitation(false);
    try {
      window.localStorage.setItem(invitationKey, "yes");
    } catch {
      /* 저장이 막혀도 현재 화면에서는 닫는다. */
    }
  };
  const startGuide = () => {
    dismiss();
    setGuideOpen(true);
  };
  useEffect(() => {
    if (location.pathname === "/consult" && !guideOpen) openPanel();
  }, [location.pathname, openPanel, guideOpen]);
  // 첫 안내 말풍선은 잠깐만 보이고 스스로 접힌다(닫음 기록은 남기지 않아 다음 방문에 다시 보인다).
  useEffect(() => {
    if (!invitation) return;
    const timer = window.setTimeout(() => setInvitation(false), 9000);
    return () => window.clearTimeout(timer);
  }, [invitation]);
  return (
    <div className={`assistant-shell${open ? " assistant-shell--open" : ""}`}>
      {open && <AssistantPanel onGuide={startGuide} />}
      {invitation && !open && !guideOpen && (
        <div className="assistant-invitation" role="status">
          <button
            type="button"
            className="assistant-invitation__close"
            onClick={dismiss}
            aria-label="고래 안내 닫기"
          >
            ×
          </button>
          <p>행사를 고르거나 물어보세요.</p>
          <button type="button" onClick={startGuide}>
            사용법 +
          </button>
        </div>
      )}
      {guideOpen && (
        <AssistantGuide
          onClose={() => {
            setGuideOpen(false);
            dismiss();
          }}
        />
      )}
      <FloatingWhale
        working={busy}
        published={Boolean(forecastId)}
        onClick={openPanel}
        onMoved={dismiss}
        panelOpen={open}
      />
    </div>
  );
}
