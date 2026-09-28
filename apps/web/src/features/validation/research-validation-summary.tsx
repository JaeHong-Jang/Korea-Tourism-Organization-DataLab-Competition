// 개선 중인 v2 모델의 성적을 이전 연구·기준선과 같은 분모로 비교해 보여 준다.
import { num as number, percent } from "./research-format";
import { researchV2 } from "./research-v2-data";

// MAE 막대는 세 방법 중 가장 큰 값을 기준으로 하고 정확한 값은 직접 표기한다.
function ComparisonBar({
  label,
  value,
  maximum,
  selected = false,
}: {
  label: string;
  value: number;
  maximum: number;
  selected?: boolean;
}) {
  return (
    <div className="research-comparison__row">
      <span>{label}</span>
      <div className="research-comparison__track" aria-hidden="true">
        <span
          className={selected ? "is-selected" : undefined}
          style={{ width: `${(value / maximum) * 100}%` }}
        />
      </div>
      <strong>{number(value, 1)}</strong>
    </div>
  );
}

// 연구 상태를 먼저 밝히고 연도별 성적을 이어서 읽게 한다.
export function ResearchValidationSummary() {
  const data = researchV2;
  const totalEvaluation = data.evaluation.reduce(
    (sum, item) => sum + item.events,
    0,
  );
  return (
    <section
      id="research-signed-model"
      className="research-validation"
      aria-labelledby="research-validation-title"
    >
      <header className="research-validation__header">
        <div>
          <span className="research-status">{data.status}</span>
          <h2 id="research-validation-title">개선 중인 모델 · v2</h2>
          <p>
            같은 행사의 지난 회차 기록을 더해 매달 다시 학습했어요. 2025·2026년{" "}
            {number(totalEvaluation)}건으로 채점했어요.
          </p>
          <p className="research-validation__note">
            예측 대상이 시군구 방문 순증이라 위 모델의 오차율과 직접 비교하지
            않아요.
          </p>
        </div>
        <dl className="research-validation__snapshot">
          <div>
            <dt>학습</dt>
            <dd>{number(data.snapshot.trained)}건</dd>
          </div>
          <div>
            <dt>범위 보정</dt>
            <dd>{number(data.snapshot.calibrated)}건</dd>
          </div>
        </dl>
      </header>

      <div className="research-year-grid">
        {data.evaluation.map((item) => {
          const maximum = Math.max(
            item.v2.mae,
            item.v1.mae,
            item.typeMedian.mae,
          );
          return (
            <article key={item.year} className="research-year-card">
              <header>
                <div>
                  <h3>{item.year}년</h3>
                </div>
                <p>
                  {item.period} · {number(item.events)}행 ·{" "}
                  {number(item.windows)}개 지역·기간
                </p>
              </header>
              <p className="research-comparison__caption">
                평균 오차 (명/일) · 짧을수록 좋음
              </p>
              <div className="research-comparison">
                <ComparisonBar
                  label="v2"
                  value={item.v2.mae}
                  maximum={maximum}
                  selected
                />
                <ComparisonBar
                  label="이전 연구"
                  value={item.v1.mae}
                  maximum={maximum}
                />
                <ComparisonBar
                  label="유형 중앙값"
                  value={item.typeMedian.mae}
                  maximum={maximum}
                />
              </div>
              <p className="research-year-card__interval">
                범위 적중 <strong>{percent(item.v2.coverage)}</strong>
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
