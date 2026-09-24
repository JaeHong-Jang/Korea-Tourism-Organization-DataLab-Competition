// 저장한 행사와 예보 이력을 표 중심으로 배치한다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";

// 목록을 먼저 보여 주고 재예보·실측·공유는 하단에 분리한다.
export function MyEventsPage() {
  return (
    <div className="page-wrap regular-page">
      <PageHeading
        eyebrow="S5 · 저장한 행사"
        title="내 행사"
        description="저장한 행사와 지난 예보를 다시 찾아보세요."
      />
      <div className="table-layout">
        <FeaturePanel
          id="M5-F1"
          title="저장한 행사"
          description="행사명·일자·등급·상태·마지막 예보를 표로 볼 수 있어요."
          className="table-main"
        />
        <FeaturePanel
          id="M5-F2"
          title="예보 이력"
          description="시점별로 남긴 예보를 순서대로 확인하세요."
          className="table-side"
        />
        <FeaturePanel
          id="M5-F3"
          title="재예보"
          description="행사 전 새로운 날씨를 반영한 변화를 살펴보세요."
        />
        <FeaturePanel
          id="M5-F4"
          title="실측 입력·채점"
          description="행사 후 실제 결과를 입력해 예보와 비교하세요."
        />
        <FeaturePanel
          id="M5-F5"
          title="공유 링크"
          description="저장한 예보서를 다른 담당자와 공유하세요."
        />
      </div>
    </div>
  );
}
