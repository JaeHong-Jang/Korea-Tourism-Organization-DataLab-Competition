// 미니 대한민국 장면과 그 위에 놓일 필터·목록·타임라인 자리를 둔다.
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FeaturePanel } from "../components/common/feature-panel";
import { MiniKoreaCanvas } from "../components/scene";
import { crowdScale } from "../components/scene/crowd-scale";
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
  preferredView,
  rememberView,
} from "../features/map-2d/view-preference";
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
  const [view, setView] = useState<"3d" | "2d">(() =>
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
  const [svgMode] = useState(() => {
    if (new URLSearchParams(window.location.search).get("forceSvg") === "1")
      return true;
    try {
      return !document.createElement("canvas").getContext("webgl2");
    } catch {
      return true;
    }
  });

  // 주소 이동과 브라우저 뒤로 가기에서도 저장한 보기 선택을 복원한다.
  useEffect(() => {
    setView(preferredView(location.search));
  }, [location.search]);

  // 현재 필터·데모 주소를 보존한 채 보기만 바꾼다.
  const changeView = (next: "3d" | "2d") => {
    setView(next);
    rememberView(next);
    const query = new URLSearchParams(location.search);
    if (next === "2d") query.set("view", "2d");
    else query.delete("view");
    navigate({ pathname: location.pathname, search: query.toString() });
  };

  return (
    <div className="scene-page">
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
          미니 대한민국
        </h1>
        {svgMode ? (
          <SvgKoreaMap festivals={festivals} />
        ) : view === "2d" ? (
          <MapLibreMap
            festivals={festivals}
            overviewRevision={overviewRevision}
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
        <fieldset className="scene-overview scene-view-toggle">
          <legend className="sr-only">장면 보기</legend>
          <button
            type="button"
            aria-pressed={!svgMode && view === "3d"}
            disabled={svgMode}
            onClick={() => changeView("3d")}
            title={svgMode ? "WebGL이 없어 SVG 지도를 보여 줍니다" : undefined}
          >
            3D
          </button>
          <button
            type="button"
            aria-pressed={!svgMode && view === "2d"}
            disabled={svgMode}
            onClick={() => changeView("2d")}
            title={svgMode ? "2D 지도에도 WebGL이 필요합니다" : undefined}
          >
            2D 지도
          </button>
        </fieldset>
      </section>
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
        {!svgMode && view === "3d" ? (
          <SceneLegend
            peoplePerDoll={scale.peoplePerDoll}
            capExceeded={scale.capExceeded}
            festivals={festivals}
            dataMode={dataMode}
            totals={totals}
            controls={
              <DataModeToggle enabled={dataMode} onChange={changeDataMode} />
            }
            notices={<HonestNotices festivals={festivals} fixture={fixture} />}
          />
        ) : (
          <div className="scene-svg-notices">
            {svgMode && (
              <p>
                WebGL을 사용할 수 없어 SVG 지도를 보여 줍니다. 3D와 2D 지도에는
                WebGL이 필요해요.
              </p>
            )}
            <DataModeToggle
              enabled={false}
              onChange={changeDataMode}
              disabled
            />
            <p>
              {svgMode ? "SVG 지도" : "2D 지도"}에서는 데이터 모드를 사용할 수
              없어요.
            </p>
            <HonestNotices festivals={festivals} fixture={fixture} />
          </div>
        )}
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
