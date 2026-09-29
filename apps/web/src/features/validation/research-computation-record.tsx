// 연구 모델을 어떤 기준선과 견줬고 실행이 규칙대로 돌았는지의 기록을 보여 준다.
import { num } from "./research-format";
import { researchV2 } from "./research-v2-data";

// 방법별 오차·기준선 대비 차이·검사 항목을 실행 식별자와 함께 남긴다.
export function ResearchComputationRecord() {
  const {
    baselines,
    comparisons,
    checks,
    versions,
    runId,
    previousRunId,
    ranOn,
    rows,
  } = researchV2;
  return (
    <div className="research-detail">
      <section
        className="validation-table-scroll"
        aria-label="예측 방법별 평균 절대오차"
      >
        <table>
          <thead>
            <tr>
              <th>예측 방법</th>
              {baselines.columns.map((year) => (
                <th key={year}>{year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {baselines.rows.map((row) => (
              <tr key={row.label} className={row.ours ? "is-ours" : undefined}>
                <th>{row.label}</th>
                {row.values.map((value, index) => (
                  <td key={baselines.columns[index]}>{num(value, 1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="research-detail__note">
        2024년은 설정을 고르는 데 쓴 개발 자료입니다. 단위는 명/일이고 낮을수록
        좋습니다.
      </p>
      <section
        className="validation-table-scroll"
        aria-label="v2와 기준선의 차이와 재표집 구간"
      >
        <table>
          <thead>
            <tr>
              <th>평가 연도</th>
              <th>견준 대상</th>
              <th>MAE 차이</th>
              <th>95% 구간</th>
              <th>표본</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((item) => (
              <tr key={`${item.year}-${item.against}`}>
                <th>{item.year}년</th>
                <td>{item.against}</td>
                <td>{num(item.difference, 1)}</td>
                <td>
                  {num(item.interval[0])} ~ {num(item.interval[1])}
                </td>
                <td>
                  {num(item.rows)}행 · {num(item.regions)}개 지역
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="research-detail__note">
        음수가 v2가 나은 쪽입니다. 지역 단위 1,000회 재표집으로 구한 보조
        구간입니다.
      </p>
      <dl className="research-rules research-rules--checks">
        {checks.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="research-detail__note">
        실행 기록 {runId} · 이전 기록 {previousRunId} · 실행일 {ranOn} · 스냅샷{" "}
        {num(rows)}행. 코드 services/forecast/src/crowdcast/research/silver_v2/.
        Python {versions.python} · LightGBM {versions.lightgbm} · numpy{" "}
        {versions.numpy} · polars {versions.polars} · scikit-learn{" "}
        {versions.sklearn}.
      </p>
    </div>
  );
}
