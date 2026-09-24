// 예보서 문서와 근거 서랍, 보조 탭의 자리를 잡는다.
import { useParams } from "react-router-dom";
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { Button } from "../components/ui/button";

// 선택한 예보 식별자는 표시만 하고 실제 내용은 후속 작업에서 연결한다.
export function ForecastPage() {
  const { forecastId } = useParams();
  return (
    <div className="forecast-page page-wrap">
      <div className="page-title-row">
        <PageHeading
          eyebrow={`S3 · ${forecastId ?? "예보"}`}
          title="예보서"
          description="판정과 수치, 그 판단을 뒷받침하는 근거가 함께 놓여요."
        />
        <Button size="sm" disabled>
          계획 초안 받기
        </Button>
      </div>
      <div className="document-layout">
        <div className="document-main">
          <FeaturePanel
            id="M3-F1"
            title="예보서"
            description="행사 정보, 판정, 핵심 수치와 준비할 일을 순서대로 보여 드려요."
            className="document-sheet"
          >
            <div className="document-sheet__lines" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </FeaturePanel>
          <div className="document-tabs">
            <FeaturePanel
              id="M3-F3"
              title="근거 지도"
              description="문장부터 데이터셋까지 이어지는 연결을 볼 수 있어요."
            />
            <FeaturePanel
              id="M3-F4"
              title="행사장 3D"
              description="행사 시각의 현장과 이동 흐름을 살펴보세요."
            />
          </div>
        </div>
        <FeaturePanel
          id="M3-F2"
          title="근거 서랍"
          description="예보서 문장에 연결된 자료·규정·가정을 확인하세요."
          className="evidence-drawer"
        />
      </div>
    </div>
  );
}
