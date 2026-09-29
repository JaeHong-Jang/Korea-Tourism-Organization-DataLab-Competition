// 연도별 수집 범위와 행사별 연결 출처를 내려받을 수 있게 제공한다.
import type { CollectionInventory } from "./collection-data";

// 행사명 등 문자열은 스프레드시트 수식으로 실행되지 않도록 CSV 셀로 인코딩한다.
function cell(value: unknown): string {
  const text = String(value ?? "");
  const safe =
    typeof value === "string" && /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

// 한쪽 자료만 있는 행사도 포함해 조사 결과와 미확보 범위를 함께 보존한다.
export function CollectionSources({
  inventory,
}: {
  inventory: CollectionInventory | null;
}) {
  if (!inventory) return null;
  const download = () => {
    const header = [
      "행사ID",
      "연도",
      "행사명",
      "지역",
      "시작",
      "종료",
      "날짜근거",
      "자료상태",
      "발표값",
      "발표단위",
      "발표지표",
      "발표근사치",
      "관측값",
      "관측단위",
      "관측지표",
      "관측근사치",
      "지역증감명/일",
      "반복등록연도",
      "확인사항",
      "출처기록",
    ];
    const rows = inventory.rows.map((row) => [
      row.id,
      row.year,
      row.eventName,
      row.region,
      row.start,
      row.end,
      row.dateBasis,
      row.status,
      row.announced?.value,
      row.announced?.unit,
      row.announced?.label,
      row.announced ? (row.announced.approximate ? "근사치" : "기재값") : "",
      row.observed?.value,
      row.observed?.unit,
      row.observed?.label,
      row.observed ? (row.observed.approximate ? "근사치" : "기재값") : "",
      row.regional?.value,
      row.recurrenceYears.join("/"),
      row.limitation,
      row.sources.join(" | "),
    ]);
    const blob = new Blob(
      [
        "\uFEFF",
        [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `행사자료-수집목록-${inventory.asOf}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="insights-section-stack">
      <h4>전체 수집 범위 · {inventory.asOf} 기준</h4>
      <p>{inventory.scope}</p>
      {inventory.reportSources?.length ? (
        <ul>
          {inventory.reportSources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="insights-table-scroll">
        <table>
          <caption>발표·관측·지역 자료는 서로 중복될 수 있어요.</caption>
          <thead>
            <tr>
              <th>연도</th>
              <th>대상</th>
              <th>발표</th>
              <th>관측</th>
              <th>지역 참고</th>
            </tr>
          </thead>
          <tbody>
            {inventory.years.map((row) => (
              <tr key={row.year}>
                <th>{row.year}</th>
                <td>{row.ended}</td>
                <td>{row.announced}</td>
                <td>{row.observed}</td>
                <td>{row.regional}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        여러 연도에 등록된 행사 {inventory.repeatedGroups}개 · 3개 연도에 등록{" "}
        {inventory.threeYearGroups}개. 이름·지역 기준이며 실제 개최 여부와 회차
        변경은 추가 확인이 필요해요.
      </p>
      <button type="button" onClick={download}>
        전체 수집 목록 CSV
      </button>
    </section>
  );
}
