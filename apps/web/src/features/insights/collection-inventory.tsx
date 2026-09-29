// 전체 종료 일정의 자료 보유 상태와 반복 행사를 연도·검색 조건으로 탐색한다.
import type { Insight } from "@crowdcast/contracts/types";
import { useState } from "react";
import {
  COLLECTION_STATUS,
  collectionData,
  type CollectionInventory as Inventory,
} from "./collection-data";
import { CollectionEvent } from "./collection-event";

// 검색이나 연도가 바뀌면 선택과 페이지를 초기화해 숨겨진 행사를 보여 주지 않는다.
function CollectionYearView({
  inventory,
  year,
}: {
  inventory: Inventory;
  year: number;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [repeated, setRepeated] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [limit, setLimit] = useState(5);
  const summary = inventory.years.find((row) => row.year === year);
  if (!summary) return null;
  const filtered = inventory.rows
    .filter(
      (row) =>
        row.year === year &&
        (!status || row.status === status) &&
        (!repeated || row.recurrenceYears.length > 1) &&
        `${row.eventName} ${row.region}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.status === "both") - Number(a.status === "both") ||
        a.eventName.localeCompare(b.eventName, "ko"),
    );
  const selected = filtered.find((row) => row.id === selectedId) ?? filtered[0];
  const reset = () => {
    setSelectedId("");
    setLimit(5);
  };
  return (
    <div className="insights-section-stack">
      <dl className="insights-collection-counts">
        {[
          ["조사 대상", summary.ended],
          ["발표 기재값", summary.announced],
          ["관측·추정 자료", summary.observed],
          ["양쪽 확보", summary.statuses.both],
        ].map(([label, count]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{count.toLocaleString("ko-KR")}건</dd>
          </div>
        ))}
      </dl>
      <p>
        등록 일정·보고서 분석 기간 기준 · 일정 미확인 {summary.dateMissing}건,
        미종료 {summary.notEnded}건 제외
      </p>
      <div className="insights-collection-filters">
        <label>
          행사·지역 검색
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
          />
        </label>
        <label>
          자료 상태
          <select
            aria-label="자료 상태"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              reset();
            }}
          >
            <option value="">전체 {summary.ended}건</option>
            {Object.entries(COLLECTION_STATUS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}{" "}
                {summary.statuses[key as keyof typeof COLLECTION_STATUS]}건
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="insights-compare-check">
        <input
          type="checkbox"
          checked={repeated}
          onChange={(e) => {
            setRepeated(e.target.checked);
            reset();
          }}
        />
        여러 연도에 등록된 행사만
      </label>
      {selected ? (
        <CollectionEvent row={selected} />
      ) : (
        <p role="status">조건에 맞는 행사가 없어요.</p>
      )}
      <div>
        <p role="status">
          검색 결과 {filtered.length.toLocaleString("ko-KR")}건
        </p>
        <ul className="insights-collection-list">
          {filtered.slice(0, limit).map((row) => (
            <li key={row.id}>
              <button
                type="button"
                aria-pressed={selected?.id === row.id}
                onClick={() => setSelectedId(row.id)}
              >
                <span>{row.eventName}</span>
                <span>
                  {row.region} · {COLLECTION_STATUS[row.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {filtered.length > limit && (
          <button type="button" onClick={() => setLimit((old) => old + 10)}>
            10건 더 보기
          </button>
        )}
      </div>
    </div>
  );
}

// I2의 미래 예보 목록과 독립적인 전체 보유 목록을 기준으로 표시한다.
export function CollectionInventory({ insight }: { insight: Insight }) {
  const inventory = collectionData(insight);
  const [selectedYear, setYear] = useState<number | null>(null);
  if (!inventory)
    return <p role="status">전체 수집 목록을 확인할 수 없어요.</p>;
  const year =
    inventory.years.find((row) => row.year === selectedYear)?.year ??
    inventory.years.at(-1)?.year;
  if (year === undefined)
    return <p role="status">등록된 과거 행사 자료가 없어요.</p>;
  return (
    <section
      className="insights-section-stack"
      aria-label="연도별 자료 수집 현황"
    >
      <fieldset
        className="insights-view-buttons insights-year-buttons"
        aria-label="방문 자료 연도"
      >
        {inventory.years.map((row) => (
          <button
            type="button"
            key={row.year}
            aria-pressed={year === row.year}
            onClick={() => setYear(row.year)}
          >
            {row.year}
          </button>
        ))}
      </fieldset>
      <CollectionYearView key={year} inventory={inventory} year={year} />
    </section>
  );
}
