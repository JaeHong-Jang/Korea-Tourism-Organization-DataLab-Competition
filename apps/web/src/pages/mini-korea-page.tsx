// 미니 대한민국 장면과 그 위에 놓일 필터·목록·타임라인 자리를 둔다.
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FeaturePanel } from "../components/common/feature-panel";
import { MiniKoreaCanvas } from "../components/scene";
import { Button } from "../components/ui/button";
import { FestivalFiltersPanel } from "../features/festival-filters/festival-filters";
import { FestivalList } from "../features/festival-list/festival-list";
import { KpiStrip } from "../features/kpi-timeline/kpi-strip";
import { WeeklyTimeline } from "../features/kpi-timeline/weekly-timeline";
import { SvgKoreaMap } from "../features/map-2d/svg-korea-map";
import { useUpcomingFestivals } from "../lib/festivals/use-upcoming-festivals";
import { useSelectionStore } from "../lib/selection-store";

// 장면이 화면을 차지하고 부가 정보는 가장자리에 머물게 한다.
export function MiniKoreaPage() {
  const debug = new URLSearchParams(useLocation().search).get("debug") === "1";
  const filters = useSelectionStore((state) => state.filters);
  const { festivals, all, status, receivedAt, fixture } =
    useUpcomingFestivals(filters);
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
      <section className="scene-stage" aria-labelledby="scene-title">
        <h1 id="scene-title" className="sr-only">
          미니 대한민국
        </h1>
        {svgMode ? <SvgKoreaMap festivals={festivals} /> : <MiniKoreaCanvas />}
      </section>
      <div className="scene-cta">
        <Button asChild size="sm">
          <Link to="/consult">
            예보 상담 열기 <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <FeaturePanel
        id="M1-F2"
        title="필터"
        description="기간·지역·유형·등급으로 행사를 좁혀 보세요."
        className="scene-filter"
      >
        <FestivalFiltersPanel all={all} />
      </FeaturePanel>
      <FeaturePanel
        id="M1-F3"
        title="행사 목록"
        description="선택한 조건의 행사가 위험 순으로 나타나요."
        className="scene-list"
      >
        <FestivalList festivals={festivals} status={status} />
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
