// 새 연구 후보의 성적과 운영 적용 상태를 같은 분모로 비교해 보여 준다.
import { researchValidation } from "./research-validation-data";

const number = (value: number, digits = 0) =>
  value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

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

// 연구 상태를 먼저 밝히고 연도별 성적과 취약 구간을 이어서 읽게 한다.
export function ResearchValidationSummary() {
  const data = researchValidation;
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
          <h2 id="research-validation-title">1,804건 전체 자료 연구</h2>
          <p>
            SNR·음수·명절을 삭제하지 않고 {data.target}을 예측했습니다.
            2024년으로 설정을 정한 뒤 2025·2026년 {number(totalEvaluation)}건을
            같은 방식으로 평가했습니다.
          </p>
        </div>
        <dl className="research-validation__snapshot">
          <div>
            <dt>최신 연구 스냅샷 학습</dt>
            <dd>{number(data.snapshot.trained)}건</dd>
          </div>
          <div>
            <dt>예측구간 보정</dt>
            <dd>{number(data.snapshot.calibrated)}건</dd>
          </div>
        </dl>
      </header>

      <div className="research-year-grid">
        {data.evaluation.map((item) => {
          const maximum = Math.max(
            item.mae,
            item.typeMedianMae,
            item.snrFilteredMae,
          );
          return (
            <article key={item.year} className="research-year-card">
              <header>
                <div>
                  <span>고정 평가</span>
                  <h3>{item.year}년</h3>
                </div>
                <p>
                  {item.period} · {number(item.events)}행 ·{" "}
                  {number(item.windows)}개 지역·기간
                </p>
              </header>
              <p className="research-comparison__caption">
                평균 절대오차(MAE) · 낮을수록 좋음 · 명/일
              </p>
              <div
                className="research-comparison"
                role="img"
                aria-label={`${item.year}년 평균 절대오차 비교, 단위 명/일`}
              >
                <ComparisonBar
                  label="전체 자료 모델"
                  value={item.mae}
                  maximum={maximum}
                  selected
                />
                <ComparisonBar
                  label="유형 중앙값"
                  value={item.typeMedianMae}
                  maximum={maximum}
                />
                <ComparisonBar
                  label="SNR>3만 학습"
                  value={item.snrFilteredMae}
                  maximum={maximum}
                />
              </div>
              <p className="research-year-card__interval">
                10–90% 구간 포함률{" "}
                <strong>{(item.coverage * 100).toFixed(1)}%</strong>
                <span>평균 폭 {number(item.meanWidth)}명/일</span>
              </p>
            </article>
          );
        })}
      </div>

      <section className="research-risk" aria-labelledby="research-risk-title">
        <div>
          <span>운영 적용을 보류한 이유</span>
          <h3 id="research-risk-title">큰 행사에서 과소예측이 남았습니다</h3>
          <p>{data.caveat}</p>
          <p>평균 오차가 음수면 실제 순증보다 적게 예측했다는 뜻입니다.</p>
        </div>
        <div className="research-risk__items">
          {data.cautions.map((item) => (
            <article key={item.label}>
              <strong>{item.label}</strong>
              <span>{number(item.count)}건</span>
              <p>MAE {number(item.mae)}명/일</p>
              <p>평균 오차 {number(item.bias)}명/일</p>
              <p>구간 포함률 {(item.coverage * 100).toFixed(1)}%</p>
              <small>{item.definition}</small>
            </article>
          ))}
        </div>
      </section>

      <details className="research-method" id="research-method">
        <summary>학습 자료와 검증 방법 보기</summary>
        <div>
          <section>
            <h3>예측에 사용</h3>
            <ul>
              {data.features.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>예측에서 제외</h3>
            <ul>
              {data.excludedFeatures.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <p>
            행사마다 개최 14일 전까지 공개된 관측만 사용하고, 같은 지역·기간의
            중복은 총 가중치가 1이 되게 보정했습니다. 실행 기록 {data.runId}.
          </p>
        </div>
      </details>
    </section>
  );
}
