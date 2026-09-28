// 공개 사례의 서로 다른 집계값을 보존하고 안전 검토 항목을 제안한다.
import type { Insight } from "@crowdcast/contracts/types";
import {
  type PublicComparison,
  publicComparisons,
} from "./public-comparison-data";

// 수치의 집계 방식에 따라 확인할 항목을 제안한다.
function proposal(row: PublicComparison) {
  if (row.announced.unit === "매")
    return "입장권 집계와 방문 인원 집계를 구분하고, 행사장 주변 유입도 함께 점검하세요.";
  if (row.announced.approximate)
    return "발표 근사값과 통신 추정값의 집계 범위를 확인하고, 현장 수용 인원과 함께 검토하세요.";
  return "집계 기간·구역·중복 기준을 맞춘 뒤, 안전계획에 사용할 방문객 기준을 정하세요.";
}

// 비교 조건이 다른 사례는 비율 대신 원수치와 검토 제안을 보여 준다.
export function PublicComparisons({ insight }: { insight: Insight }) {
  const rows = publicComparisons(insight);
  if (!rows.length) return <p role="status">검토할 공개 사례가 없습니다.</p>;
  return (
    <section
      className="insights-case-list"
      aria-label="과거 사례와 검토 제안"
      data-evidence-ids={insight.evidenceIds.join(" ")}
    >
      <p className="insights-case-note">집계 기준이 다른 참고 수치입니다.</p>
      {rows.map((row) => (
        <article className="insights-case" key={row.id}>
          <h3>
            {row.year} · {row.eventName}
          </h3>
          <p className="insights-case-period">{row.periodLabel}</p>
          <dl className="insights-case-values">
            {[row.announced, row.observed].map((quantity) => (
              <div key={quantity.label}>
                <dt>{quantity.label}</dt>
                <dd>
                  {quantity.approximate ? "약 " : ""}
                  {quantity.value.toLocaleString("ko-KR")}
                  {quantity.unit}
                </dd>
              </div>
            ))}
          </dl>
          <p className="insights-case-proposal">
            <strong>검토 제안</strong> · {proposal(row)}
          </p>
          <div className="insights-case-links">
            {row.sources.map((source) =>
              source.url ? (
                <a
                  key={source.title}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.title}
                </a>
              ) : (
                <span key={source.title}>{source.title}</span>
              ),
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
