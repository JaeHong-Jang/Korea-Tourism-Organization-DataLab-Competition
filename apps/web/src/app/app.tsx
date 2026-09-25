// 공용 헤더와 여덟 화면의 주소를 연결한다.
import { Route, Routes } from "react-router-dom";
import { SiteHeader } from "../components/common/site-header";
import { ConsultPage } from "../pages/consult-page";
import { DevPage } from "../pages/dev-page";
import { ForecastPage } from "../pages/forecast-page";
import { InsightsPage } from "../pages/insights-page";
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
    <div className="app-shell">
      <SiteHeader />
      <HeaderWeatherChip />
      <main id="main-content">
        <Routes>
          <Route path="/" element={<MiniKoreaPage />} />
          <Route path="/consult" element={<ConsultPage />} />
          <Route path="/f/:forecastId" element={<ForecastPage />} />
          <Route path="/f/:forecastId/plan" element={<PlanPage />} />
          <Route path="/my" element={<MyEventsPage />} />
          <Route path="/s/:token" element={<SharedPage />} />
          <Route path="/validation" element={<ValidationPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/ops" element={<OpsPage />} />
          <Route path="/dev/*" element={<DevPage />} />
        </Routes>
      </main>
      <footer className="site-footer">
        참고용 예보예요. 최종 판단은 담당자가 해 주세요.
      </footer>
    </div>
  );
}
