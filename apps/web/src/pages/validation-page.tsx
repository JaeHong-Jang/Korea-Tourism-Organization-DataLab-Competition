// 검증을 성적 한 문장, 산점도, 나눈 방법, 한계, 앞으로의 채점 순으로 읽게 한다.
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { GoldenCases } from "../features/validation/golden-cases";
import { ModelDetails } from "../features/validation/model-details";
import { PerformanceMetrics } from "../features/validation/performance-metrics";
import { PredictionScatter } from "../features/validation/prediction-scatter";
import { PreregistrationBoard } from "../features/validation/preregistration-board";
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
        description="지금 쓰는 모델이 학습에 넣지 않은 행사에서 일평균을 얼마나 맞췄는지부터 읽습니다."
      />
      <ValidationStory state={backtest} />
      <div className="validation-layout">
        <FeaturePanel
          id="M6-F2"
          title="예측과 실측"
          description="점은 일평균입니다. 색은 구간 안에 들어왔는지이고, 점을 누르면 행사 이름과 구간이 남습니다."
          className="validation-chart"
        >
          <PredictionScatter state={backtest} />
        </FeaturePanel>
      </div>
      <div className="validation-folds">
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
      </div>
    </div>
  );
}
