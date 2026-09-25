// 미니 대한민국 장면 위에 왼쪽 안내·지도 도구·범례와 오른쪽 탭 패널(목록·필터·현황)을 둔다.
import { ArrowUpRight, Layers, Maximize } from "lucide-react";
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
import { HonestNotices } from "../features/mini-korea/honest-notices";
import "../features/mini-korea/mini-korea.css";
import { KpiStrip } from "../features/kpi-timeline/kpi-strip";
import { WeeklyTimeline } from "../features/kpi-timeline/weekly-timeline";
import { SvgKoreaMap } from "../features/map-2d/svg-korea-map";
import { useAssistantStore } from "../lib/consult-store";
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
  const [tab, setTab] = useState<"list" | "filter" | "status">("list");
  const showSpotlight = useAssistantStore((state) => state.showSpotlight);
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

  // 고른 행사는 목록 아래 요약 대신 고래 말풍선 카드로 띄우고, 화면을 떠나면 내린다.
  useEffect(() => {
    showSpotlight(selected);
  }, [selected, showSpotlight]);
  useEffect(() => () => showSpotlight(null), [showSpotlight]);

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
  // 지도는 미니어처 하나만 두고 WebGL2가 없는 기기에서만 간단한 지도로 대신한다.
  const svgMode =
    !webglAvailable ||
    new URLSearchParams(location.search).get("forceSvg") === "1";

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
        // 휠 버튼 끌기는 회전이므로 브라우저 자동 스크롤이 끼어들지 않게 한다.
        onMouseDown={(event) => {
          if (event.button === 1 && event.target instanceof HTMLCanvasElement)
            event.preventDefault();
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
          <p className="scene-mobile-scale">
            인형 1개 = {scale.peoplePerDoll.toLocaleString("ko-KR")}명 ·
            움직임은 연출
          </p>
        )}
      </section>
      <div className="scene-left-rail">
        <div className="scene-left-rail__top">
          <section className="scene-intro" aria-labelledby="scene-intro-title">
            <p className="scene-intro__eyebrow">전국 행사 인파예보</p>
            <h2 id="scene-intro-title">미니 대한민국</h2>
            <p>
              다가오는 행사 {festivals.length.toLocaleString("ko-KR")}건의 순간
              최대 인파를 미리 봐요.
            </p>
            <div className="scene-cta">
              <Button asChild size="sm">
                <Link to="/consult">
                  예보 상담 열기 <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </section>
          {!svgMode && (
            <div
              className="scene-map-tools"
              role="toolbar"
              aria-label="지도 도구"
            >
              <button
                type="button"
                onClick={() => {
                  selectFestival(null);
                  selectSigungu(null);
                  setOverviewRevision((value) => value + 1);
                }}
              >
                <Maximize size={16} aria-hidden="true" />
                전국 보기
              </button>
              <button
                type="button"
                className="data-mode-toggle"
                aria-pressed={dataMode}
                onClick={() => changeDataMode(!dataMode)}
              >
                <Layers size={16} aria-hidden="true" />
                데이터 모드
              </button>
              <p className="scene-map-tools__hint">
                왼쪽 끌기 이동 · 휠 끌기 회전 · 휠 굴려 확대
              </p>
            </div>
          )}
        </div>
        <div className="scene-legend-panel">
          {svgMode && (
            <p className="scene-svg-notices">
              이 기기에서는 간단한 지도로 보여 드려요. 행사 선택은 목록에서도 할
              수 있어요.
            </p>
          )}
          <SceneLegend
            peoplePerDoll={scale.peoplePerDoll}
            capExceeded={scale.capExceeded}
            festivals={festivals}
            dataMode={dataMode && !svgMode}
            totals={totals}
            notices={<HonestNotices festivals={festivals} fixture={fixture} />}
            city={
              Boolean(selected) &&
              !svgMode &&
              new URLSearchParams(location.search).get("sceneCity") !== "0"
            }
          />
        </div>
      </div>
      <FeaturePanel
        id="M1-F3"
        title="행사 둘러보기"
        description="위험 순 목록에서 고르고, 조건을 좁히거나 주간 흐름을 살펴요."
        className="scene-list"
      >
        <div className="scene-tabs" role="tablist" aria-label="행사 둘러보기">
          {(
            [
              ["list", `행사 목록 ${festivals.length.toLocaleString("ko-KR")}`],
              ["filter", "필터"],
              ["status", "행사 현황"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`scene-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`scene-tabpanel-${key}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="scene-tabpanel-list"
          aria-labelledby="scene-tab-list"
          hidden={tab !== "list"}
        >
          <FestivalList festivals={festivals} status={status} />
        </div>
        <div
          role="tabpanel"
          id="scene-tabpanel-filter"
          aria-labelledby="scene-tab-filter"
          className="scene-filter"
          data-feature="M1-F2"
          hidden={tab !== "filter"}
        >
          <FestivalFiltersPanel all={all} />
        </div>
        <div
          role="tabpanel"
          id="scene-tabpanel-status"
          aria-labelledby="scene-tab-status"
          className="scene-timeline"
          data-feature="M1-F4"
          hidden={tab !== "status"}
        >
          <KpiStrip
            festivals={festivals}
            receivedAt={receivedAt}
            fixture={fixture}
            status={status}
          />
          <WeeklyTimeline festivals={festivals} status={status} />
        </div>
      </FeaturePanel>
      <span className="scene-id" data-feature="M1-F1" aria-hidden="true">
        {debug ? "M1-F1 · 전국 판" : null}
      </span>
    </div>
  );
}
