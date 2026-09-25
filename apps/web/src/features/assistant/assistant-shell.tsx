// 모든 화면에 고래 봇을 띄우고 상담 화면에서는 대화 서랍을 연다.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  useAssistantStore,
  useSharedConsultSession,
} from "../../lib/consult-store";
import { AssistantPanel } from "./assistant-panel";
import { FloatingWhale } from "./floating-whale";

// 라우트 진입 때만 자동으로 열고 사용자가 닫은 상태는 현재 화면에서 존중한다.
export function AssistantShell() {
  const location = useLocation();
  const open = useAssistantStore((state) => state.open);
  const openPanel = useAssistantStore((state) => state.openPanel);
  const { busy, forecastId } = useSharedConsultSession();
  useEffect(() => {
    if (location.pathname === "/consult") openPanel();
  }, [location.pathname, openPanel]);
  return (
    <div className={`assistant-shell${open ? " assistant-shell--open" : ""}`}>
      {open && <AssistantPanel />}
      <FloatingWhale
        working={busy}
        published={Boolean(forecastId)}
        onClick={openPanel}
      />
    </div>
  );
}
