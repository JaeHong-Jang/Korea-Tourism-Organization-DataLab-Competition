// 미니 대한민국 장면과 그 위에 놓일 필터·목록·타임라인 자리를 둔다.
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FeaturePanel } from "../components/common/feature-panel";
import { MiniKoreaCanvas } from "../components/scene";
import { crowdScale } from "../components/scene/crowd-scale";
import { GradeMark } from "../components/scene/grade-mark";
import { SceneLegend } from "../components/scene/scene-legend";
import { Button } from "../components/ui/button";
import { FestivalFiltersPanel } from "../features/festival-filters/festival-filters";
import { FestivalList } from "../features/festival-list/festival-list";
import { sigunguPeaks } from "../features/mini-korea/data-mode";
import { DataModeToggle } from "../features/mini-korea/data-mode-toggle";
import { FestivalSummaryPanel } from "../features/mini-korea/festival-summary";
import { HonestNotices } from "../features/mini-korea/honest-notices";
import "../features/mini-korea/mini-korea.css";
import { KpiStrip } from "../features/kpi-timeline/kpi-strip";
import { WeeklyTimeline } from "../features/kpi-timeline/weekly-timeline";
import { MapLibreMap } from "../features/map-2d/maplibre-map";
import { SvgKoreaMap } from "../features/map-2d/svg-korea-map";
import {
  type MapView,
  preferredView,
  rememberView,
} from "../features/map-2d/view-preference";
import { ViewControls } from "../features/map-3d/view-controls";
import { useUpcomingFestivals } from "../lib/festivals/use-upcoming-festivals";
import { useSelectionStore } from "../lib/selection-store";
// 장면이 화면을 차지하고 부가 정보는 가장자리에 머물게 한다(필터 결과를 판·목록·KPI가 함께 쓴다).
export function MiniKoreaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const debug = new URLSearchParams(location.search).get("debug") === "1";
  const dataMode = new URLSearchParams(location.search).get("data") === "1";
  const filters = useSelectionStore((state) => state.filters);
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const selectSigungu = useSelectionStore((state) => state.selectSigungu);
  const { festivals, all, status, receivedAt, fixture } =
    useUpcomingFestivals(filters);
  const [scale, setScale] = useState(() => crowdScale([], "high"));
  const [overviewRevision, setOverviewRevision] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<
    "filter" | "list" | "timeline" | "legend"
  >("filter");
  const [view, setView] = useState<MapView>(() =>
    preferredView(location.search),
  );
  const selected =
    festivals.find((festival) => festival.eventId === selectedId) ?? null;
  const totals = useMemo(() => sigunguPeaks(festivals), [festivals]);

  // 필터가 고른 행사를 숨기면 장면과 요약에 오래된 선택이 남지 않게 한다.
  useEffect(() => {
    if (
      status === "ready" &&
      selectedId &&
      !festivals.some((festival) => festival.eventId === selectedId)
    ) {
      selectFestival(null);
      selectSigungu(null);
    }
  }, [status, selectedId, festivals, selectFestival, selectSigungu]);

  // Escape는 장면·목록·SVG에서 공유하는 행사 선택을 해제한다.
  useEffect(() => {
    const clear = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        selectFestival(null);
        selectSigungu(null);
      }
    };
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, [selectFestival, selectSigungu]);

  // 데이터 모드는 다른 필터와 진단 쿼리를 보존해 링크로 공유한다.
  const changeDataMode = (enabled: boolean) => {
    const query = new URLSearchParams(location.search);
    if (enabled) query.set("data", "1");
    else query.delete("data");
    navigate({ pathname: location.pathname, search: query.toString() });
  };
  const [webglAvailable] = useState(() => {
    try {
      return Boolean(document.createElement("canvas").getContext("webgl2"));
    } catch {
      return false;
    }
  });
  const svgMode =
    view === "svg" ||
    !webglAvailable ||
    new URLSearchParams(location.search).get("forceSvg") === "1";

  // 주소 이동과 브라우저 뒤로 가기에서도 저장한 보기 선택을 복원한다.
  useEffect(() => {
    setView(preferredView(location.search));
  }, [location.search]);

  // 현재 필터·데모 주소를 보존한 채 보기만 바꾼다.
  const changeView = (next: MapView) => {
    const query = new URLSearchParams(location.search);
    setView(next);
    rememberView(next);
    query.delete("forceSvg");
    query.set("view", next);
    navigate({ pathname: location.pathname, search: query.toString() });
  };

  return (
    <div className="scene-page" data-mobile-panel={mobilePanel}>
      <section
        className="scene-stage"
        aria-labelledby="scene-title"
        role="application"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: 캔버스 컨테이너에 직접 포커스해 카메라 방향키를 켠다.
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.target instanceof HTMLCanvasElement)
            event.currentTarget.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            selectFestival(null);
            selectSigungu(null);
          }
        }}
        onClick={(event) => {
          if (
            svgMode &&
            (event.target instanceof SVGSVGElement ||
              (event.target instanceof HTMLElement &&
                event.target.classList.contains("svg-korea-map")))
          ) {
            selectFestival(null);
            selectSigungu(null);
          }
        }}
      >
        <h1 id="scene-title" className="sr-only">
          대한민국 행사 지도
        </h1>
        {svgMode ? (
          <SvgKoreaMap festivals={festivals} />
        ) : view !== "miniature" ? (
          <MapLibreMap
            festivals={festivals}
            overviewRevision={overviewRevision}
            mode={view === "top" ? "top" : "3d"}
          />
        ) : (
          <MiniKoreaCanvas
            festivals={festivals}
            onScaleChange={setScale}
            dataMode={dataMode}
            totals={totals}
            overviewRevision={overviewRevision}
          />
        )}
        {!svgMode && (
          <button
            type="button"
            className="scene-overview"
            onClick={() => {
              selectFestival(null);
              selectSigungu(null);
              setOverviewRevision((value) => value + 1);
            }}
          >
            전국 보기
          </button>
        )}
        <ViewControls
          view={view}
          svgMode={svgMode}
          webglAvailable={webglAvailable}
          onChange={changeView}
        />
        {!svgMode && view === "miniature" && (
          <p className="scene-mobile-scale">
            인형 1개 = {scale.peoplePerDoll.toLocaleString("ko-KR")}명 ·
            움직임은 연출
          </p>
        )}
      </section>
      <nav className="scene-mobile-tabs" aria-label="미니 대한민국 정보">
        {(
          [
            ["filter", "필터"],
            ["list", "행사 목록"],
            ["timeline", "행사 현황"],
            ["legend", "범례"],
          ] as const
        ).map(([panel, label]) => (
          <button
            key={panel}
            type="button"
            aria-pressed={mobilePanel === panel}
            onClick={() => setMobilePanel(panel)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="scene-cta">
        <Button asChild size="sm">
          <Link to="/consult">
            예보 상담 열기 <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <div className="scene-left-rail">
        <FeaturePanel
          id="M1-F2"
          title="필터"
          description="기간·지역·유형·등급으로 행사를 좁혀 보세요."
          className="scene-filter"
        >
          <FestivalFiltersPanel all={all} />
        </FeaturePanel>
        <div className="scene-legend-panel">
          {!svgMode && view === "miniature" ? (
            <SceneLegend
              peoplePerDoll={scale.peoplePerDoll}
              capExceeded={scale.capExceeded}
              festivals={festivals}
              dataMode={dataMode}
              totals={totals}
              controls={
                <DataModeToggle enabled={dataMode} onChange={changeDataMode} />
              }
              notices={
                <HonestNotices festivals={festivals} fixture={fixture} />
              }
            />
          ) : (
            <div className="scene-svg-notices">
              {svgMode && (
                <p>
                  이 기기에서는 간단한 지도로 보여 드려요. 행사 선택은
                  목록에서도 할 수 있어요.
                </p>
              )}
              <DataModeToggle
                enabled={false}
                onChange={changeDataMode}
                disabled
              />
              <p>
                {svgMode ? "SVG 지도" : "실제 지도"}에서는 데이터 모드를 사용할
                수 없어요.
              </p>
              <fieldset className="scene-legend__grades">
                <legend className="sr-only">행사 등급 범례</legend>
                {[1, 2, 3, 4].map((level) => (
                  <span className="scene-legend__grade" key={level}>
                    <span
                      className="scene-legend__flag"
                      style={{ background: `var(--level-${level})` }}
                    />
                    <GradeMark level={level} />
                  </span>
                ))}
              </fieldset>
              <HonestNotices festivals={festivals} fixture={fixture} />
            </div>
          )}
        </div>
      </div>
      <FeaturePanel
        id="M1-F3"
        title="행사 목록"
        description="선택한 조건의 행사가 위험 순으로 나타나요."
        className="scene-list"
      >
        <FestivalList festivals={festivals} status={status} />
        <FestivalSummaryPanel festival={selected} status={status} />
      </FeaturePanel>
      <FeaturePanel
        id="M1-F4"
        title="행사 현황"
        description="행사 흐름과 등급별 주간 변화를 살펴보세요."
        className="scene-timeline"
      >
        <KpiStrip
          festivals={festivals}
          receivedAt={receivedAt}
          fixture={fixture}
          status={status}
        />
        <WeeklyTimeline festivals={festivals} status={status} />
      </FeaturePanel>
      <span className="scene-id" data-feature="M1-F1" aria-hidden="true">
        {debug ? "M1-F1 · 전국 판" : null}
      </span>
    </div>
  );
}
