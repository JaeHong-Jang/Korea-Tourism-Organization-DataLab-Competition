// 지금 모델의 검증 기록 → 축제 총 방문객 추이 → 개선 중인 모델 → 앞으로의 채점 순으로 읽게 한다.
import { Link } from "react-router-dom";
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { FestivalVisitorsChart } from "../features/validation/festival-visitors-chart";
import { PerformanceMetrics } from "../features/validation/performance-metrics";
import { PreregistrationBoard } from "../features/validation/preregistration-board";
import { ResearchComputationRecord } from "../features/validation/research-computation-record";
import { ResearchSplitDetails } from "../features/validation/research-split-details";
import { ResearchValidationSummary } from "../features/validation/research-validation-summary";
import { getBacktest, getScores } from "../lib/validation/api";
import { useContract } from "../lib/validation/use-contract";

// 지금 모델 기록은 API에서, 개선 모델 기록은 고정 산출물에서 온다 — 둘을 섞지 않는다.
export function ValidationPage() {
  const backtest = useContract(getBacktest);
  const scores = useContract(getScores);
  const summary = backtest.value;
  const skipped = summary?.disclosure?.skippedYears ?? [];
  return (
    <div className="page-wrap regular-page validation-page">
      <PageHeading
        eyebrow="과거 예측 성능을 확인해요"
        title="모델 검증"
        description="예보 모델이 지난 행사를 얼마나 맞혔는지 봐요."
      />
      <nav className="page-links" aria-label="관련 화면">
        <Link to="/my">내 행사에 실측 입력하기 →</Link>
      </nav>
      <FeaturePanel
        id="M6-F1"
        title="지금 모델: 검증 방법과 계산 기록"
        className="validation-method-current"
      >
        <div className="validation-content">
          <p>
            {summary?.evalYears.join(", ") || "—"}년을 평가할 때 학습은 2년
            전까지, 보정은 직전 해로 나눴어요. 건너뛴 연도:{" "}
            {skipped.length
              ? skipped
                  .map((item) => `${item.year}년 ${item.reason}`)
                  .join(" · ")
              : "없음"}
          </p>
          <PerformanceMetrics state={backtest} />
        </div>
      </FeaturePanel>
      <details className="validation-fold validation-method validation-method--top">
        <summary>개선 중인 모델 v2: 검증 방법과 계산 기록</summary>
        <div className="validation-content">
          <ResearchSplitDetails />
          <ResearchComputationRecord />
        </div>
      </details>
      <div className="validation-layout">
        <FeaturePanel
          id="M6-F2"
          title="축제 총 방문객 추이와 2026 예측"
          description="2017~2025년은 실제 발표 합계, 2026년은 예측이에요."
          className="validation-chart"
        >
          <FestivalVisitorsChart />
        </FeaturePanel>
        <ResearchValidationSummary />
        <FeaturePanel
          id="M6-F4"
          title="앞으로의 채점"
          description="행사 전에 예보를 등록해 두고, 끝난 뒤 실측으로 채점해요."
          className="validation-evidence"
        >
          <PreregistrationBoard state={scores} />
        </FeaturePanel>
      </div>
    </div>
  );
}
