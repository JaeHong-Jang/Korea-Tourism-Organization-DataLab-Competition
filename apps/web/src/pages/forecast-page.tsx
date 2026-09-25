// 발행된 예보서 스냅샷 한 건으로 문서·근거 지도·행사장 3D·근거 서랍을 그린다.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ErrorState } from "../components/common/error-state";
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import {
  ReportDrawer,
  useEvidenceDrawer,
} from "../features/evidence/report-drawer";
import { EvidenceMap } from "../features/evidence-map/evidence-map";
import { ReportActions } from "../features/forecast-report/report-actions";
import { ReportClaims } from "../features/forecast-report/report-claims";
import { claimText } from "../features/forecast-report/report-content";
import { ReportContext } from "../features/forecast-report/report-context";
import { ReportJudgment } from "../features/forecast-report/report-judgment";
import { ReportNumbers } from "../features/forecast-report/report-numbers";
import { ReportToolbar } from "../features/forecast-report/report-toolbar";
import { useReport } from "../features/forecast-report/use-report";
import { Venue3D } from "../features/venue-3d/venue-3d";
import "../features/forecast-report/report.css";
import "@xyflow/react/dist/style.css";
import "../styles/evidence-map.css";

// 예보서 탭 순서(방향키 이동 순서와 같다)
const TABS = ["report", "map", "venue"] as const;
type ForecastTab = (typeof TABS)[number];

// 로딩·계약 오류를 분리하고 검증된 스냅샷만 문서에 전달한다.
export function ForecastPage() {
  const { forecastId } = useParams();
  const state = useReport(forecastId);
  const drawer = useEvidenceDrawer();
  const [tab, setTab] = useState<ForecastTab>("report");
  const [focusClaimId, setFocusClaimId] = useState<string | null>(null);

  // 지도에서 고른 문장으로 돌아오면 문서의 해당 문장을 강조하고 초점을 준다.
  useEffect(() => {
    if (tab !== "report" || !focusClaimId || state.status !== "ready") return;
    const claim = state.report.claims.find((item) => item.id === focusClaimId);
    if (!claim) return;
    const text = claimText(claim, state.report);
    const frame = requestAnimationFrame(() => {
      const line = [
        ...document.querySelectorAll<HTMLElement>(
          ".document-sheet .report-claim",
        ),
      ].find((item) => item.textContent?.startsWith(text));
      if (!line) return;
      line.classList.add("report-claim--map-selected");
      line.tabIndex = -1;
      line.scrollIntoView({ block: "center" });
      line.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document
        .querySelectorAll(".report-claim--map-selected")
        .forEach((item) => {
          item.classList.remove("report-claim--map-selected");
        });
    };
  }, [tab, focusClaimId, state]);

  // 좌우 화살표로 세 탭을 돌고 선택된 탭만 키보드 순서에 둔다.
  const chooseTab = (next: ForecastTab) => {
    setFocusClaimId(null);
    setTab(next);
  };
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : TABS.length - 1;
    const next = TABS[(TABS.indexOf(tab) + step) % TABS.length];
    chooseTab(next);
    document.getElementById(`forecast-tab-${next}`)?.focus();
  };
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
        <>
          <div
            className="forecast-tabs"
            role="tablist"
            aria-label="예보서 보기"
          >
            <button
              id="forecast-tab-report"
              type="button"
              role="tab"
              aria-selected={tab === "report"}
              aria-controls="forecast-panel-report"
              tabIndex={tab === "report" ? 0 : -1}
              onClick={() => chooseTab("report")}
              onKeyDown={onTabKeyDown}
            >
              예보서
            </button>
            <button
              id="forecast-tab-map"
              type="button"
              role="tab"
              aria-selected={tab === "map"}
              aria-controls="forecast-panel-map"
              tabIndex={tab === "map" ? 0 : -1}
              onClick={() => chooseTab("map")}
              onKeyDown={onTabKeyDown}
            >
              근거 지도
            </button>
            <button
              id="forecast-tab-venue"
              type="button"
              role="tab"
              aria-selected={tab === "venue"}
              aria-controls="forecast-panel-venue"
              tabIndex={tab === "venue" ? 0 : -1}
              onClick={() => chooseTab("venue")}
              onKeyDown={onTabKeyDown}
            >
              행사장 3D
            </button>
          </div>
          <div className="document-layout">
            <div className="document-main">
              <div
                id="forecast-panel-report"
                className={`forecast-tab-panel forecast-tab-panel--report${tab === "report" ? " is-active" : ""}`}
                role="tabpanel"
                aria-labelledby="forecast-tab-report"
              >
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
              <div
                id="forecast-panel-map"
                className={`forecast-tab-panel forecast-tab-panel--map${tab === "map" ? " is-active" : ""}`}
                role="tabpanel"
                aria-labelledby="forecast-tab-map"
              >
                {tab === "map" && (
                  <EvidenceMap
                    report={state.report}
                    onOpen={drawer.open}
                    onViewClaim={(id) => {
                      setFocusClaimId(id);
                      setTab("report");
                    }}
                  />
                )}
              </div>
              <div
                id="forecast-panel-venue"
                className={`forecast-tab-panel forecast-tab-panel--venue${tab === "venue" ? " is-active" : ""}`}
                role="tabpanel"
                aria-labelledby="forecast-tab-venue"
              >
                {tab === "venue" && <Venue3D report={state.report} />}
              </div>
            </div>
            <ReportDrawer
              report={state.report}
              selectedId={drawer.selectedId}
              onClose={drawer.close}
            />
          </div>
        </>
      )}
    </div>
  );
}
