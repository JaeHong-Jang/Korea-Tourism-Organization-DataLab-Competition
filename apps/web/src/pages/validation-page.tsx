// 검증을 성적 한 문장, 산점도, 나눈 방법, 한계, 앞으로의 채점 순으로 읽게 한다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { GoldenCases } from "../features/validation/golden-cases";
import { ModelDetails } from "../features/validation/model-details";
import { PerformanceMetrics } from "../features/validation/performance-metrics";
import { PredictionScatter } from "../features/validation/prediction-scatter";
import { PreregistrationBoard } from "../features/validation/preregistration-board";
import { ResearchValidationSummary } from "../features/validation/research-validation-summary";
import { ValidationStory } from "../features/validation/validation-story";
import { getBacktest, getModelCard, getScores } from "../lib/validation/api";
import { useContract } from "../lib/validation/use-contract";

// 같은 백테스트 응답을 요약·산점도·한계에서 공유한다.
export function ValidationPage() {
  const backtest = useContract(getBacktest);
  const scores = useContract(getScores);
  const model = useContract(getModelCard);
  const summary = backtest.value;
  const skipped = summary?.disclosure?.skippedYears ?? [];
  return (
    <div className="page-wrap regular-page validation-page">
      <PageHeading
        eyebrow="과거 예측 성능을 확인해요"
        title="모델 검증"
        description="새 1,804건 연구모델과 현재 발행 모델의 기록을 구분해 확인합니다."
      />
      <ResearchValidationSummary />
      <section
        className="validation-current"
        aria-labelledby="current-model-title"
      >
        <header>
          <span>현재 발행 모델 기록</span>
          <h2 id="current-model-title">발행 예보의 기존 백테스트</h2>
          <p>
            아래 API 기록은 위 연구 후보와 다른 모델입니다. 새 연구 결과를 아직
            발행 예보에 적용하지 않았습니다.
          </p>
        </header>
        <ValidationStory state={backtest} />
      </section>
      <div className="validation-layout">
        <FeaturePanel
          id="M6-F2"
          title="현재 발행 모델: 예측과 실측"
          description="점은 일평균입니다. 색은 구간 안에 들어왔는지이고, 점을 누르면 행사 이름과 구간이 남습니다."
          className="validation-chart"
        >
          <PredictionScatter state={backtest} />
        </FeaturePanel>
      </div>
      <section
        className="validation-folds"
        aria-label="현재 발행 모델 상세 기록"
      >
        <details className="validation-fold">
          <summary>어떻게 나눴나</summary>
          <div className="validation-content">
            <p>
              평가 연도가 {summary?.evalYears.join(", ") || "—"}년이면 학습은 그
              2년 전까지, 보정은 직전 해, 시험은 그 해의 행사입니다. 외부 자료는
              시험 행사 기준일(개최 14일 전)까지 공개된 것만 학습에 남깁니다.
            </p>
            <p>
              건너뛴 연도:{" "}
              {skipped.length
                ? skipped
                    .map((item) => `${item.year}년 ${item.reason}`)
                    .join(" · ")
                : "없음"}
            </p>
          </div>
        </details>
        <details className="validation-fold">
          <summary>아직 말 못 하는 것</summary>
          <div className="validation-content">
            <p>
              순간 최대는 일평균에 피크일 계수와 동시체류율을 곱한 추정이고,
              순간 인원 정답으로 채점하지 않았습니다. 시험 행사 가운데 실측이
              1,000명 미만인 건이 없으면 등급이 경계를 가려 냈다고 말할 수
              없습니다.
            </p>
            <GoldenCases state={backtest} />
            <ModelDetails
              state={model}
              goldenEmpty={summary?.golden.length === 0}
            />
          </div>
        </details>
        <details className="validation-fold">
          <summary>앞으로의 채점</summary>
          <div className="validation-content">
            <p>
              아래는 과거 성적이 아닙니다. 행사가 열리기 전에 예보를 공개 등록해
              두고, 끝난 뒤 맞출 약속과 그 원장입니다.
            </p>
            <PreregistrationBoard state={scores} />
          </div>
        </details>
        <details className="validation-fold">
          <summary>계산 기록</summary>
          <div className="validation-content">
            <p>
              비교 쌍과 실행 식별자입니다. 첫 화면의 세 칸과 같은
              백테스트입니다.
            </p>
            <PerformanceMetrics state={backtest} />
          </div>
        </details>
      </section>
    </div>
  );
}
