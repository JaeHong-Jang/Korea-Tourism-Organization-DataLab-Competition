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
import { SvgKoreaMap } from "../features/map-2d/svg-korea-map";
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
  return (
    <div className="scene-page">
      <section
        className="scene-stage"
        aria-labelledby="scene-title"
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
        ) : (
          <MiniKoreaCanvas
            festivals={festivals}
            onScaleChange={setScale}
            dataMode={dataMode}
            totals={totals}
          />
        )}
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
        {!svgMode ? (
          <SceneLegend
            peoplePerDoll={scale.peoplePerDoll}
            capExceeded={scale.capExceeded}
            festivals={festivals}
            dataMode={dataMode}
            controls={
              <DataModeToggle enabled={dataMode} onChange={changeDataMode} />
            }
            notices={<HonestNotices festivals={festivals} fixture={fixture} />}
          />
        ) : (
          <div className="scene-svg-notices">
            <DataModeToggle
              enabled={false}
              onChange={changeDataMode}
              disabled
            />
            <p>SVG 지도에서는 데이터 모드를 사용할 수 없어요.</p>
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
        title="KPI 띠·타임라인"
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
