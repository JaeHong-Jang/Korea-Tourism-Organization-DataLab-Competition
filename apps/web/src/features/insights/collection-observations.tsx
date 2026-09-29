// 확보한 관측 참고값을 출처와 집계 단위별로 나눠 보여 준다.
import type { CollectionInventory, CollectionRow } from "./collection-data";

// 같은 공개 보고서와 같은 연도별 원자료로 확인한 행사만 막대 묶음에 넣는다.
const GROUPS = [
  {
    title: "보고서의 일평균 방문자 추정",
    unit: "명/일",
    ids: [
      "e-2024-41190-dda90d726e",
      "e-2024-51210-9ca1b5a579",
      "e-2024-51150-26f5a8a5ea",
      "e-2024-51150-72f354ba93",
    ],
    note: "같은 보고서에 실린 참고값이에요. 분석 구역과 집계 기준이 미공개여서 행사장 방문객 순위로 해석할 수 없어요.",
  },
  {
    title: "연천 구석기축제 · 연도별 관측 기록",
    unit: "명",
    ids: ["e-2024-41800-1468c210e0", "e-2025-41800-7d4625c4a0"],
    note: "같은 데이터랩 연도별 자료의 각 4일 집계예요. 연도별 집계 구역·중복 기준의 동일성은 미확인이에요.",
  },
];

// 막대는 해당 묶음 안에서만 같은 축을 쓰며 다른 정의의 관측값은 수치로만 보여 준다.
function ObservationValues({
  rows,
  bars,
}: {
  rows: CollectionRow[];
  bars: boolean;
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.observed?.value ?? 0));
  return (
    <ul className="insights-bars">
      {rows.map((row) => {
        const value = row.observed;
        if (!value) return null;
        return (
          <li key={row.id}>
            <span>
              {row.year} · {row.eventName}
            </span>
            <strong>
              {value.approximate ? "약 " : ""}
              {value.value.toLocaleString("ko-KR")}
              {value.unit}
            </strong>
            {bars && (
              <div className="insights-bar-track" aria-hidden="true">
                <div
                  className="insights-bar-fill insights-public-bar-1"
                  style={{ width: `${(value.value / maximum) * 100}%` }}
                />
              </div>
            )}
            {!bars && (
              <p>
                {value.label} · {row.limitation}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// 관측 보유 건수와 동일 조건의 유효 비교쌍을 별도로 표시한다.
export function CollectionObservations({
  inventory,
  pairs,
}: {
  inventory: CollectionInventory;
  pairs: number;
}) {
  const observed = inventory.rows.filter((row) => row.observed !== null);
  const groups = GROUPS.map((group) => ({
    ...group,
    rows: group.ids.flatMap((id) =>
      observed.filter(
        (row) => row.id === id && row.observed?.unit === group.unit,
      ),
    ),
  }));
  const grouped = new Set(
    groups.flatMap((group) => group.rows.map((row) => row.id)),
  );
  const other = observed.filter((row) => !grouped.has(row.id));
  return (
    <section
      className="insights-section-stack"
      aria-label="확보한 관측 참고 자료"
    >
      <p>
        관측·추정 자료 {observed.length}건 · 동일 조건으로 확인된 발표·관측 비교{" "}
        {pairs}쌍
      </p>
      {observed.length === 0 && (
        <p role="status">아직 연결된 관측 자료가 없어요.</p>
      )}
      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <section
            className="insights-distribution"
            key={group.title}
            aria-label={group.title}
          >
            <h3>{group.title}</h3>
            <ObservationValues rows={group.rows} bars />
            <p>{group.note}</p>
          </section>
        ))}
      {other.length > 0 && (
        <section
          className="insights-distribution"
          aria-label="집계 방식이 다른 관측 기록"
        >
          <h3>집계 방식이 다른 관측 기록</h3>
          <ObservationValues rows={other} bars={false} />
        </section>
      )}
    </section>
  );
}
