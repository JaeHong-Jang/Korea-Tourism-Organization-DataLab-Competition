// 같은 자료로 재학습한 후보의 참고 점수와 실제 방문객 검증의 한계를 구분한다.
import type { Insight } from "@crowdcast/contracts/types";
import { insightEvidence } from "./insight-data";

type Score = {
  model: string;
  tier: string;
  mdape: number;
  coverage80: number;
  coverageN: number;
  intervalWidthMedian: number;
};
type Evaluation = {
  candidate: string;
  definition: string;
  scores: Score[];
  years: number[];
};

// 숫자와 표본이 확인된 실험만 표시하며 정확도를 100에서 오차를 뺀 값으로 만들지 않는다.
export function InsightModelReview({ insight }: { insight: Insight }) {
  const value = insightEvidence(insight).find(
    (row) => row.modelExperiment,
  )?.modelExperiment;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as { evaluations?: Evaluation[]; promoted?: boolean };
  if (!Array.isArray(data.evaluations) || data.promoted !== false) return null;
  const comparisons = [
    ["baseline", "simple", "기존 방식"],
    ["regularized", "lightgbm", "LightGBM 개선 후보"],
    ["history", "history", "전회차 관측 결합"],
  ];
  const rows = comparisons.map(([candidate, model, label]) => {
    const evaluation = data.evaluations?.find(
      (row) => row.candidate === candidate && row.definition === "conditional",
    );
    const score = evaluation?.scores.find(
      (row) => row.model === model && row.tier === "silver",
    );
    return { label, score, years: evaluation?.years };
  });
  if (
    rows.some(
      ({ score }) =>
        !score ||
        !Number.isInteger(score.coverageN) ||
        score.coverageN <= 0 ||
        !Number.isFinite(score.mdape) ||
        score.mdape < 0 ||
        !Number.isFinite(score.coverage80) ||
        score.coverage80 < 0 ||
        score.coverage80 > 1 ||
        !Number.isFinite(score.intervalWidthMedian) ||
        score.intervalWidthMedian < 0,
    )
  )
    return null;
  const n = rows[0].score?.coverageN;
  if (rows.some((row) => row.score?.coverageN !== n)) return null;
  const gold = data.evaluations
    .find(
      (row) => row.candidate === "history" && row.definition === "conditional",
    )
    ?.scores.find((row) => row.tier === "goldA");
  return (
    <section className="insights-section-stack" aria-label="모델 재학습 비교">
      <h4>모델을 다시 학습해 비교했어요</h4>
      <div className="insights-source-table">
        <table>
          <caption>
            {rows[0].years?.join("·")}년 지역 방문 증감 자료 {n}건 · 행사장
            방문객 정확도와는 달라요
          </caption>
          <thead>
            <tr>
              <th scope="col">방식</th>
              <th scope="col">오차 중앙값</th>
              <th scope="col">범위 포함률</th>
              <th scope="col">범위 폭 중앙값</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(
              ({ label, score }) =>
                score && (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{score.mdape.toFixed(1)}%</td>
                    <td>{(score.coverage80 * 100).toFixed(1)}%</td>
                    <td>
                      {Math.round(score.intervalWidthMedian).toLocaleString(
                        "ko-KR",
                      )}
                      명/일
                    </td>
                  </tr>
                ),
            )}
          </tbody>
        </table>
      </div>
      <p>
        오차는 낮을수록 좋아요. 포함률은 관측값이 예측 범위 안에 든 비율이며,
        범위를 넓히기만 해도 올라갈 수 있어요.
      </p>
      <p>
        행사 방문객 관측 평가 {gold?.coverageN ?? 0}건으로 일반적인 정확도를
        판단하기 어려워 기존 예보를 유지했어요. 새 후보는 별도 행사에서 추가
        검증이 필요해요.
      </p>
      <p className="insights-caption">
        이미 검토한 과거 자료를 재사용한 탐색 결과예요. 전회차 결합은 첫 결과
        확인 후 추가했고, 당시 자료 공개 시점도 완전히 입증되지 않았어요.
      </p>
    </section>
  );
}
