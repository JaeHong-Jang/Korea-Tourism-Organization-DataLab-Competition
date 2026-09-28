// 저장된 예측값의 반복을 표시하고 편중 원인과 관측 오차를 구분한다.
import type { Insight } from "@crowdcast/contracts/types";
import { insightEvidence } from "./insight-data";

// 전체 예보와 일치하는 유효한 진단만 공개한다.
export function InsightPredictionPatterns({ insight }: { insight: Insight }) {
  const value = insightEvidence(insight).find(
    (row) => row.predictionDiagnostics,
  )?.predictionDiagnostics;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const keys = [
    "dailyPatternCount",
    "peakPatternCount",
    "largeRuleCount",
    "outsideTrainingCount",
  ];
  if (
    data.sampleSize !== insight.sampleSize ||
    insight.sampleSize <= 0 ||
    keys.some(
      (key) =>
        typeof data[key] !== "number" ||
        !Number.isInteger(data[key]) ||
        Number(data[key]) < 0 ||
        Number(data[key]) > insight.sampleSize,
    ) ||
    Number(data.dailyPatternCount) < 1 ||
    Number(data.peakPatternCount) < 1
  )
    return null;
  return (
    <section className="insights-callout" aria-label="저장 예보 점검 결과">
      <h4>예보 자료를 점검해 보니</h4>
      <dl className="insights-status-grid">
        <div>
          <dt>분석한 예보</dt>
          <dd>{insight.sampleSize}건</dd>
        </div>
        <div>
          <dt>서로 다른 방문객 예측</dt>
          <dd>{Number(data.dailyPatternCount)}가지</dd>
        </div>
        <div>
          <dt>학습 자료·범위 주의</dt>
          <dd>{Number(data.outsideTrainingCount)}건</dd>
        </div>
      </dl>
      <p>
        예보 {insight.sampleSize}건의 하루 평균 방문객 예측은{" "}
        {Number(data.dailyPatternCount)}가지 조합으로 반복돼요. 같은 예측값이
        여러 행사에 적용되어 행사별 차이를 충분히 나타내는지 검토가 필요해요.
      </p>
      <div>
        <ul>
          <li>대규모 인파 규칙 적용: {Number(data.largeRuleCount)}건</li>
          <li>
            학습 자료가 부족하거나 학습 범위를 벗어난 조건:{" "}
            {Number(data.outsideTrainingCount)}건
          </li>
        </ul>
        <p>
          저장된 예측 구간의 하한·중앙값·상한을 대조한 결과예요. 반복만으로 편중
          원인이나 실제 오차를 확정할 수 없어요.
        </p>
      </div>
    </section>
  );
}
