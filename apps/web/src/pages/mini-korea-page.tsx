// 미니 대한민국 장면과 그 위에 놓일 필터·목록·타임라인 자리를 둔다.
import { ArrowUpRight, MapPinned } from "lucide-react";
import { Link } from "react-router-dom";
import { FeaturePanel } from "../components/common/feature-panel";
import { Button } from "../components/ui/button";

// 장면이 화면을 차지하고 부가 정보는 가장자리에 머물게 한다.
export function MiniKoreaPage() {
  return (
    <div className="scene-page">
      <section className="scene-stage" aria-labelledby="scene-title">
        <div className="scene-stage__center">
          <span className="scene-stage__icon">
            <MapPinned size={35} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <span className="eyebrow">지금, 전국의 행사</span>
          <h1 id="scene-title">미니 대한민국</h1>
          <p>전국 행사를 한눈에 살펴볼 수 있는 장면이 여기에 놓여요.</p>
          <Button asChild size="sm">
            <Link to="/consult">
              예보 상담 열기 <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div
          className="scene-stage__contour scene-stage__contour--one"
          aria-hidden="true"
        />
        <div
          className="scene-stage__contour scene-stage__contour--two"
          aria-hidden="true"
        />
        <div className="scene-stage__note">
          인원 규모는 예보값 비례 · 움직임은 연출
        </div>
      </section>
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
      <span className="scene-id" aria-hidden="true">
        M1-F1 · 전국 판
      </span>
    </div>
  );
}
