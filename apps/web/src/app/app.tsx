// 공용 헤더와 각 화면의 주소를 연결한다.
import type { MouseEvent } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { SiteHeader } from "../components/common/site-header";
import { AssistantShell } from "../features/assistant/assistant-shell";
import {
  ConsultSessionProvider,
  useAssistantStore,
} from "../lib/consult-store";
import { useSelectionStore } from "../lib/selection-store";
import { ConsultPage } from "../pages/consult-page";
import { DevPage } from "../pages/dev-page";
import { ForecastPage } from "../pages/forecast-page";
import { InsightsPage } from "../pages/insights-page";
import { KnowledgeGraphPage } from "../pages/knowledge-graph-page";
import { MiniKoreaPage } from "../pages/mini-korea-page";
import { MyEventsPage } from "../pages/my-events-page";
import { OpsPage } from "../pages/ops-page";
import { PlanPage } from "../pages/plan-page";
import { SharedPage } from "../pages/shared-page";
import { ValidationPage } from "../pages/validation-page";
import { HeaderWeatherChip } from "./header-weather-chip";

// 이후 각 레인이 페이지 내부만 구현할 수 있게 라우트를 고정한다.
export function App() {
  return (
    <ConsultSessionProvider>
      <AppLayout />
    </ConsultSessionProvider>
  );
}

// 요약 패널의 기존 상담 링크도 현재 선택 행사를 즉시 전송한다.
function AppLayout() {
  const location = useLocation();
  const chooseFestival = useAssistantStore((state) => state.chooseFestival);
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const festivals = useSelectionStore((state) => state.timelineFestivals);

  // 기존 지도 요약 링크에서도 선택한 행사 id로 예보 상담을 시작한다.
  const openSummaryForecast = (event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest(".festival-summary a[href^='/consult?text=']");
    const festival = festivals.find((item) => item.eventId === selectedId);
    if (link && festival) {
      event.preventDefault();
      chooseFestival(festival);
    }
  };
  return (
    <div className="app-shell">
      <SiteHeader />
      <HeaderWeatherChip />
      <main id="main-content" onClickCapture={openSummaryForecast}>
        {location.pathname === "/validation" && (
          <nav className="validation-graph-nav" aria-label="검증 둘러보기">
            <span>검증</span>
            <Link to="/graph">근거 그래프</Link>
          </nav>
        )}
        <Routes>
          <Route path="/" element={<MiniKoreaPage />} />
          <Route path="/consult" element={<ConsultPage />} />
          <Route path="/f/:forecastId" element={<ForecastPage />} />
          <Route path="/f/:forecastId/plan" element={<PlanPage />} />
          <Route path="/my" element={<MyEventsPage />} />
          <Route path="/s/:token" element={<SharedPage />} />
          <Route path="/validation" element={<ValidationPage />} />
          <Route path="/graph" element={<KnowledgeGraphPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/ops" element={<OpsPage />} />
          <Route path="/dev/*" element={<DevPage />} />
        </Routes>
      </main>
      <AssistantShell />
      <footer className="site-footer">
        참고용 예보예요. 최종 판단은 담당자가 해 주세요.
      </footer>
    </div>
  );
}
