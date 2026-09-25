// 상담 세션과 대화 패널의 화면 간 공유 상태를 제공한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { createContext, type ReactNode, useContext } from "react";
import { create } from "zustand";
import { useConsultSession } from "../features/consult-chat/use-consult-session";

type AssistantState = {
  open: boolean;
  requestedFestival: FestivalSummary | null;
  openPanel: () => void;
  closePanel: () => void;
  chooseFestival: (festival: FestivalSummary) => void;
  clearRequest: () => void;
  // 지도·목록에서 고른 행사를 고래 말풍선 카드로 띄운다(없으면 null).
  spotlight: FestivalSummary | null;
  showSpotlight: (festival: FestivalSummary | null) => void;
};

// 지도와 목록에서도 같은 상담 패널을 열고 행사 요청을 전달한다.
export const useAssistantStore = create<AssistantState>((set) => ({
  open: window.location.pathname === "/consult",
  requestedFestival: null,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  chooseFestival: (requestedFestival) => set({ open: true, requestedFestival }),
  clearRequest: () => set({ requestedFestival: null }),
  spotlight: null,
  showSpotlight: (spotlight) => set({ spotlight }),
}));

const SessionContext = createContext<ReturnType<
  typeof useConsultSession
> | null>(null);

// 라우트가 바뀌어도 네트워크 세션과 발행된 예보를 유지한다.
export function ConsultSessionProvider({ children }: { children: ReactNode }) {
  const session = useConsultSession();
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

// 대화 서랍과 S2가 같은 상태를 읽도록 단일 제공자를 강제한다.
export function useSharedConsultSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("상담 세션 제공자가 필요해요.");
  return session;
}
