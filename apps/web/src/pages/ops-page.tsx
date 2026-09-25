// 운영 기록과 평가·최신성 상태를 표 중심으로 배치한다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { EvaluationCard } from "../features/ops/evaluation-card";
import { FreshnessCard } from "../features/ops/freshness-card";
import { RunList } from "../features/ops/run-list";
import { useOpsResource } from "../features/ops/use-ops-resource";
import { getOpsEvaluation, getOpsFreshness, getOpsRuns } from "../lib/ops-api";

// 실행 목록은 넓게 두고 상태 진단 패널은 별도 열에 둔다.
export function OpsPage() {
  const runs = useOpsResource(getOpsRuns);
  const evaluation = useOpsResource(getOpsEvaluation);
  const freshness = useOpsResource(getOpsFreshness);
  return (
    <div className="page-wrap regular-page">
      <PageHeading
        eyebrow="S8 · 실행 상태"
        title="운영"
        description="파이프라인의 단계와 결과를 기록으로 확인하세요."
      />
      <div className="ops-layout">
        <FeaturePanel
          id="M8-F1"
          title="파이프라인 실행 목록"
          description="단계별 상태와 산출물 해시를 펼쳐 볼 수 있어요."
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
