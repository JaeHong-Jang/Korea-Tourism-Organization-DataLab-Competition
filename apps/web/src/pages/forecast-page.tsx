// 발행된 예보서 스냅샷 한 건으로 문서와 근거 서랍을 그린다.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ErrorState } from "../components/common/error-state";
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import {
  ReportDrawer,
  useEvidenceDrawer,
} from "../features/evidence/report-drawer";
import { ReportActions } from "../features/forecast-report/report-actions";
import { ReportClaims } from "../features/forecast-report/report-claims";
import { ReportContext } from "../features/forecast-report/report-context";
import { ReportJudgment } from "../features/forecast-report/report-judgment";
import { ReportNumbers } from "../features/forecast-report/report-numbers";
import { ReportToolbar } from "../features/forecast-report/report-toolbar";
import { useReport } from "../features/forecast-report/use-report";
import { Venue3D } from "../features/venue-3d/venue-3d";
import "../features/forecast-report/report.css";

// 로딩·계약 오류를 분리하고 검증된 스냅샷만 문서에 전달한다.
export function ForecastPage() {
  const { forecastId } = useParams();
  const state = useReport(forecastId);
  const drawer = useEvidenceDrawer();
  const [tab, setTab] = useState<"report" | "venue">("report");
  return (
    <div className="forecast-page page-wrap">
      <div className="page-title-row">
        <PageHeading
          eyebrow={`S3 · ${forecastId ?? "예보"}`}
          title="예보서"
          description="판정과 수치, 그 판단을 뒷받침하는 근거를 함께 확인해요."
        />
        {state.status === "ready" && <ReportToolbar report={state.report} />}
      </div>
      {state.status === "loading" && (
        <p role="status">발행된 예보서를 불러오고 있어요.</p>
      )}
      {state.status === "error" && <ErrorState message={state.error} />}
      {state.status === "ready" && (
        <div role="tablist" aria-label="예보서 보기" className="report-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "report"}
            onClick={() => setTab("report")}
          >
            예보서
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "venue"}
            onClick={() => setTab("venue")}
          >
            행사장 3D
          </button>
        </div>
      )}
      {state.status === "ready" && tab === "venue" && (
        <Venue3D report={state.report} />
      )}
      {state.status === "ready" && tab === "report" && (
        <div className="document-layout">
          <div className="document-main">
            <FeaturePanel
              id="M3-F1"
              title="발행 예보서"
              description="참고용 — 담당자 검토 필수"
              className="document-sheet"
            >
              <ReportJudgment report={state.report} onOpen={drawer.open} />
              <ReportNumbers report={state.report} onOpen={drawer.open} />
              <ReportClaims
                report={state.report}
                onOpen={drawer.open}
                exclude={["판정", "권고"]}
              />
              <ReportContext report={state.report} onOpen={drawer.open} />
              <ReportActions report={state.report} onOpen={drawer.open} />
              <ol className="report-print-notes" aria-label="근거 각주">
                {state.report.evidence.map((evidence) => (
                  <li key={evidence.id}>{evidence.title}</li>
                ))}
              </ol>
            </FeaturePanel>
          </div>
          <ReportDrawer
            report={state.report}
            selectedId={drawer.selectedId}
            onClose={drawer.close}
          />
        </div>
      )}
    </div>
  );
}
