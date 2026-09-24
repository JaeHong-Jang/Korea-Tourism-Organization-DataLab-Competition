// 성능 지표와 사례, 근거 현황을 서로 다른 크기로 배치한다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";

// 수치가 없는 단계이므로 그래프와 점수 대신 기능 설명만 둔다.
export function ValidationPage() {
  return (
    <div className="page-wrap regular-page">
      <PageHeading
        eyebrow="S6 · 결과를 다시 확인해요"
        title="검증"
        description="예보가 얼마나 맞았는지와 근거가 어디까지 연결되는지 살펴보세요."
      />
      <div className="validation-layout">
        <FeaturePanel
          id="M6-F1"
          title="성능 지표"
          description="오차·포함률·판정 재현율과 비교 기준을 보여 드려요."
          className="validation-kpis"
        />
        <FeaturePanel
          id="M6-F2"
          title="예측과 실측"
          description="예측값과 실제 관측값의 관계를 그림과 표로 확인하세요."
          className="validation-chart"
        />
        <FeaturePanel
          id="M6-F5"
          title="근거 대시보드"
          description="문장별 근거 연결과 데이터 출처를 점검하세요."
          className="validation-evidence"
        />
        <FeaturePanel
          id="M6-F3"
          title="골든 케이스"
          description="검토 대상으로 정한 실제 행사를 비교해요."
          className="validation-cases"
        />
        <FeaturePanel
          id="M6-F4"
          title="사전 등록 예보 채점판"
          description="미리 등록한 예보의 채점 기록과 검증 결과를 보여 드려요."
          className="validation-score"
        />
        <FeaturePanel
          id="M6-F6"
          title="모델 카드"
          description="학습 범위와 버전, 사용 시 주의점을 확인하세요."
          className="validation-model"
        />
      </div>
    </div>
  );
}
