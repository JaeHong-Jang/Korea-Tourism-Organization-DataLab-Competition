// 검증 성적을 앞에 두고 근거·사례·등록·모델의 한계를 이어 보여 준다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { EvidenceDashboard } from "../features/validation/evidence-dashboard";
import { GoldenCases } from "../features/validation/golden-cases";
import { ModelDetails } from "../features/validation/model-details";
import { PerformanceMetrics } from "../features/validation/performance-metrics";
import { PredictionScatter } from "../features/validation/prediction-scatter";
import { PreregistrationBoard } from "../features/validation/preregistration-board";
import {
  getBacktest,
  getModelCard,
  getScores,
  getUsage,
} from "../lib/validation/api";
import { useContract } from "../lib/validation/use-contract";

// 같은 백테스트 응답을 성적·산점도·골든 사례에서 공유한다.
export function ValidationPage() {
  const backtest = useContract(getBacktest);
  const usage = useContract(getUsage);
  const scores = useContract(getScores);
  const model = useContract(getModelCard);
  return (
    <div className="page-wrap regular-page validation-page">
      <PageHeading
        eyebrow="S6 · 결과를 다시 확인해요"
        title="검증"
        description="예보가 얼마나 맞았는지와 근거가 어디까지 연결되는지 살펴보세요."
      />
      <div className="validation-layout">
        <FeaturePanel
          id="M6-F1"
          title="성능 지표"
          description="평가 표본과 비교 가능 범위를 함께 확인해요."
          className="validation-kpis"
        >
          <PerformanceMetrics state={backtest} />
        </FeaturePanel>
        <FeaturePanel
          id="M6-F2"
          title="예측과 실측"
          description="일평균 방문객 예측과 실측을 같은 로그 척도로 비교해요."
          className="validation-chart"
        >
          <PredictionScatter state={backtest} />
        </FeaturePanel>
        <FeaturePanel
          id="M6-F5"
          title="근거 대시보드"
          description="문장별 근거 연결과 데이터랩까지 이어진 비율을 따로 봐요."
          className="validation-evidence"
        >
          <EvidenceDashboard state={usage} />
        </FeaturePanel>
        <FeaturePanel
          id="M6-F3"
          title="골든 케이스"
          description="보도된 인원의 단위와 비교 가능 여부를 살펴봐요."
          className="validation-cases"
        >
          <GoldenCases state={backtest} />
        </FeaturePanel>
        <FeaturePanel
          id="M6-F4"
          title="사전 등록 예보 채점판"
          description="공개된 채점과 원장 해시 체인을 확인해요."
          className="validation-score"
        >
          <PreregistrationBoard state={scores} />
        </FeaturePanel>
        <FeaturePanel
          id="M6-F6"
          title="모델 카드"
          description="사용 모델의 학습 범위와 한계를 읽어 보세요."
          className="validation-model"
        >
          <ModelDetails
            state={model}
            goldenEmpty={backtest.value?.golden.length === 0}
          />
        </FeaturePanel>
      </div>
    </div>
  );
}
