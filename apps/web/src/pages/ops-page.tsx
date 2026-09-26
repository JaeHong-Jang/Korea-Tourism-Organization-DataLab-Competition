// 운영 기록과 평가·최신성 상태를 표 중심으로 배치한다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { EvaluationCard } from "../features/ops/evaluation-card";
import { FreshnessCard } from "../features/ops/freshness-card";
import { OpsOverview } from "../features/ops/ops-overview";
import { RunList } from "../features/ops/run-list";
import { useOpsResource } from "../features/ops/use-ops-resource";
import { getOpsEvaluation, getOpsFreshness, getOpsRuns } from "../lib/ops-api";
import { getBacktest, getModelCard } from "../lib/validation/api";

// 실행 목록은 넓게 두고 상태 진단 패널은 별도 열에 둔다.
export function OpsPage() {
  const runs = useOpsResource(getOpsRuns);
  const evaluation = useOpsResource(getOpsEvaluation);
  const freshness = useOpsResource(getOpsFreshness);
  const backtest = useOpsResource(getBacktest);
  const modelCard = useOpsResource(getModelCard);
  return (
    <div className="page-wrap regular-page ops-page">
      <PageHeading
        eyebrow="S8 · 실행 상태"
        title="운영"
        description="예보 모델이 잘 돌고 있는지, 자료가 최신인지 한눈에 보고 실행 기록을 펼쳐 확인하세요."
      />
      <OpsOverview
        runs={runs}
        freshness={freshness}
        evaluation={evaluation}
        backtest={backtest}
        modelCard={modelCard}
      />
      <div className="ops-layout">
        <FeaturePanel
          id="M8-F1"
          title="파이프라인 실행 목록"
          description="최근 실행부터 결과와 이유를 보여 줘요. 단계·산출물 해시는 펼쳐서 볼 수 있어요."
          className="ops-main"
        >
          <RunList state={runs} />
        </FeaturePanel>
        <FeaturePanel
          id="M8-F2"
          title="평가 결과"
          description="발행 문장과 수치 검증 결과를 확인하세요."
        >
          <EvaluationCard state={evaluation} />
        </FeaturePanel>
        <FeaturePanel
          id="M8-F3"
          title="데이터·모델 최신성"
          description="마지막 수집일과 모델 버전, 근거 그래프 상태를 살펴보세요."
        >
          <FreshnessCard state={freshness} />
        </FeaturePanel>
      </div>
    </div>
  );
}
