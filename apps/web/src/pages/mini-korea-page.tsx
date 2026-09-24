// 미니 대한민국 장면과 그 위에 놓일 필터·목록·타임라인 자리를 둔다.

import type { FestivalSummary } from "@crowdcast/contracts/types";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FeaturePanel } from "../components/common/feature-panel";
import { MiniKoreaCanvas } from "../components/scene";
import { sceneFestivals } from "../components/scene/__fixtures__/festivals";
import { crowdScale } from "../components/scene/crowd-scale";
import { SceneLegend } from "../components/scene/scene-legend";
import { Button } from "../components/ui/button";

const EMPTY_FESTIVALS: FestivalSummary[] = [];

// 장면이 화면을 차지하고 부가 정보는 가장자리에 머물게 한다.
export function MiniKoreaPage() {
  const [scale, setScale] = useState(() => crowdScale([], "high"));
  const search = new URLSearchParams(useLocation().search);
  const debug = search.get("debug") === "1";
  const festivals =
    search.get("sceneFixture") === "1" ? sceneFestivals : EMPTY_FESTIVALS;
  return (
    <div className="scene-page">
      <section className="scene-stage" aria-labelledby="scene-title">
        <h1 id="scene-title" className="sr-only">
          미니 대한민국
        </h1>
        <MiniKoreaCanvas festivals={festivals} onScaleChange={setScale} />
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
      />
      <FeaturePanel
        id="M1-F3"
        title="행사 목록"
        description="선택한 조건의 행사가 위험 순으로 나타나요."
        className="scene-list"
      />
      <FeaturePanel
        id="M1-F4"
        title="KPI 띠·타임라인"
        description="행사 흐름과 등급별 주간 변화를 살펴보세요."
        className="scene-timeline"
      />
      <SceneLegend
        peoplePerDoll={scale.peoplePerDoll}
        capExceeded={scale.capExceeded}
        festivals={festivals}
      />
      <span className="scene-id" data-feature="M1-F1" aria-hidden="true">
        {debug ? "M1-F1 · 전국 판" : null}
      </span>
    </div>
  );
}
