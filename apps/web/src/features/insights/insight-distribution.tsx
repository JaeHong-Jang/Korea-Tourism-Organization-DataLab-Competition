// 서버가 제공한 분포를 막대와 같은 값의 표로 함께 표시한다.
import type { Distribution } from "./insight-data";

// 막대 길이만 표본 수에 맞춰 조정하고 건수는 원래 응답을 표시한다.
export function InsightDistribution({
  title,
  rows,
  size,
  levels = false,
  headingLevel = 4,
}: {
  title: string;
  rows: Distribution;
  size: number;
  levels?: boolean;
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return (
    <section className="insights-distribution" aria-label={title}>
      <Heading>{title}</Heading>
      <p className="insights-caption">표본 {size.toLocaleString("ko-KR")}건</p>
      <ul className="insights-bars" aria-label={`${title} 건수`}>
        {rows.map((row, index) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <span>{row.value.toLocaleString("ko-KR")}건</span>
            <div className="insights-bar-track" aria-hidden="true">
              <div
                className={`insights-bar-fill${levels ? ` insights-level-${index + 1}` : ""}`}
                style={{ width: `${size > 0 ? (row.value / size) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <details className="insights-details">
        <summary>{title} 수치 표 보기</summary>
        <table>
          <caption>
            {title} · 표본 {size.toLocaleString("ko-KR")}건
          </caption>
          <thead>
            <tr>
              <th scope="col">구분</th>
              <th scope="col">건수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.value.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
