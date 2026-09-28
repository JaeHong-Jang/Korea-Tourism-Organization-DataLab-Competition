// v2 연구 모델의 성적을 v1·기준선과 같은 분모로 비교해 보여 준다.
import { num as number, percent } from "./research-format";
import { researchV2 } from "./research-v2-data";

// 예측에 쓴 입력과 일부러 뺀 입력은 수치가 아니라 설계 설명이라 여기에 둔다.
const features = [
  "행사 일정·유형·주야·요금·주최·회차",
  "법정공휴일과 주말 구성",
  "예측일에 공개된 시군구 평시 방문·외지인 비중·주말 비율",
  "같은 행사의 앞선 회차 실제 순증 (D-14 전에 공개된 것만)",
];
const excludedFeatures = [
  "행사 뒤 실제 방문량",
  "SNR과 실제 순증",
  "발표 시점을 확인할 수 없는 예산·발표 인원·주최 측 과거 방문객",
];

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
          <h2 id="research-validation-title">
            v2 · {data.selected.label} 연구 모델
          </h2>
          <p>
            {number(data.rows)}건을 삭제 없이 쓰고, 같은 행사의 앞선 회차 순증(
            {number(data.priorRows)}행)을 입력에 더했습니다. 2024년으로 설정을
            고른 뒤 2025·2026년 {number(totalEvaluation)}건을 매달 다시 학습해
            평가했습니다.
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
            item.v2.mae,
            item.v1.mae,
            item.typeMedian.mae,
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
              <div className="research-comparison">
                <ComparisonBar
                  label="v2 (이번)"
                  value={item.v2.mae}
                  maximum={maximum}
                  selected
                />
                <ComparisonBar
                  label="v1"
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
                10–90% 구간 포함률 <strong>{percent(item.v2.coverage)}</strong>
                <span>평균 폭 {number(item.v2.meanWidth)}명/일</span>
              </p>
            </article>
          );
        })}
      </div>

      <details className="research-method" id="research-method">
        <summary>학습 자료와 검증 방법 보기</summary>
        <div>
          <section>
            <h3>예측에 사용</h3>
            <ul>
              {features.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>예측에서 제외</h3>
            <ul>
              {excludedFeatures.map((item) => (
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
