// 선택한 행사의 발표·관측·지역 참고 값을 다른 집계 의미로 구분한다.
import type { CollectionRow } from "./collection-data";

// 한쪽 자료가 없으면 영값을 만들지 않고 원래 단위와 미확보 상태를 보여 준다.
export function CollectionEvent({ row }: { row: CollectionRow }) {
  const quantities = [row.announced, row.observed];
  const sameUnit =
    row.announced && row.observed && row.announced.unit === row.observed.unit;
  const max = Math.max(...quantities.map((q) => q?.value ?? 0), 1);
  return (
    <section className="insights-distribution" aria-label="선택한 행사 자료">
      <h3>{row.eventName}</h3>
      <p>
        {row.region} · {row.dateBasis} {row.start ?? "시작일 미확인"} ~{" "}
        {row.end}
      </p>
      {row.recurrenceYears.length > 1 && (
        <p>같은 이름·지역의 등록 연도: {row.recurrenceYears.join(" · ")}</p>
      )}
      <ul className="insights-bars">
        {quantities.map((q, index) => (
          <li key={index === 0 ? "announced" : "observed"}>
            <span>{q?.label ?? (index === 0 ? "발표 자료" : "관측 자료")}</span>
            <strong>
              {q
                ? `${q.approximate ? "약 " : ""}${q.value.toLocaleString("ko-KR")}${q.unit}`
                : "미확보"}
            </strong>
            {sameUnit && q && (
              <div className="insights-bar-track" aria-hidden="true">
                <div
                  className={`insights-bar-fill insights-public-bar-${index}`}
                  style={{ width: `${(q.value / max) * 100}%` }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {row.observed && <p>{row.limitation}</p>}
      {row.needsReview && (
        <p>
          발표 후보가 여러 값이거나 같은 해 여러 회차여서 연결을 보류했어요.
        </p>
      )}
      {row.regional && (
        <p>
          지역 참고: 평소 대비{" "}
          {row.regional.value.toLocaleString("ko-KR", {
            maximumFractionDigits: 0,
          })}
          명/일. 시군구 방문 증감이며 행사 방문객 수는 아니에요.
        </p>
      )}
    </section>
  );
}
