// 과거 전체 행사 목록에서 발표값과 관측·추정값을 나란히 비교한다.
import type { Insight } from "@crowdcast/contracts/types";
import { useState } from "react";
import { type CollectedQuantity, collectionData } from "./collection-data";

// 미확보 값을 영값과 구분하고 원자료 단위와 수치 명칭을 보존한다.
function Quantity({ value }: { value: CollectedQuantity | null }) {
  if (!value) return <span className="insights-caption">미확보</span>;
  return (
    <>
      <strong>
        {value.approximate ? "약 " : ""}
        {value.value.toLocaleString("ko-KR")}
        {value.unit}
      </strong>
      <small>{value.label}</small>
    </>
  );
}

// 발표와 관측 수치가 모두 있는 행사만 연도와 행사 선택으로 탐색한다.
export function PastEventComparison({ insight }: { insight: Insight }) {
  const inventory = collectionData(insight);
  const [year, setYear] = useState("");
  const [eventId, setEventId] = useState("");
  const [view, setView] = useState<"both" | "announced">("both");
  if (!inventory)
    return <p role="status">과거 행사 목록을 확인할 수 없습니다.</p>;
  const available = inventory.rows.filter(
    (row) =>
      (row.announced?.value ?? 0) > 0 &&
      (row.observed === null || row.observed.value > 0),
  );
  const rows = available
    .filter(
      (row) =>
        row.announced !== null &&
        (view === "both" ? row.observed !== null : row.observed === null) &&
        (!year || row.year === Number(year)),
    )
    .sort(
      (a, b) => b.year - a.year || a.eventName.localeCompare(b.eventName, "ko"),
    );
  const visible = rows.filter((row) => !eventId || row.id === eventId);
  const selected = rows.find((row) => row.id === eventId);
  return (
    <section
      aria-label="과거 행사 방문객 자료"
      data-evidence-ids={insight.evidenceIds.join(" ")}
    >
      <nav className="insights-nav" aria-label="L1 자료 구분">
        <button
          type="button"
          aria-pressed={view === "both"}
          onClick={() => {
            setView("both");
            setEventId("");
          }}
        >
          주최측 발표 · 데이터 기반 방문객 비교 ·{" "}
          {available
            .filter((row) => row.announced && row.observed)
            .length.toLocaleString("ko-KR")}
          건
        </button>
        <button
          type="button"
          aria-pressed={view === "announced"}
          onClick={() => {
            setView("announced");
            setEventId("");
          }}
        >
          주최측 발표 방문객 ·{" "}
          {available
            .filter((row) => row.announced && !row.observed)
            .length.toLocaleString("ko-KR")}
          건
        </button>
      </nav>
      <div className="daily-forecast-controls">
        <label>
          연도
          <select
            aria-label="비교 연도"
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              setEventId("");
            }}
          >
            <option value="">2020~2026 전체</option>
            {inventory.years.map((item) => (
              <option key={item.year} value={item.year}>
                {item.year}
              </option>
            ))}
          </select>
        </label>
        <label className="insights-event-picker">
          행사 선택
          <select
            aria-label="과거 행사 선택"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
          >
            <option value="">
              전체 행사 ({rows.length.toLocaleString("ko-KR")}개)
            </option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.year} · {row.eventName} · {row.region}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="insights-caption">
        {view === "both"
          ? "원자료 수치 · 집계 단위는 각 자료 기준"
          : "주최측이 발표한 행사별 방문객수"}
      </p>
      <section
        className="past-comparison-table"
        aria-label={
          view === "both"
            ? "주최측 발표·데이터 기반 방문객 비교 목록"
            : "주최측 발표 방문객 목록"
        }
      >
        <table>
          <thead>
            <tr>
              <th scope="col">행사</th>
              <th scope="col">{view === "both" ? "기간" : "발표 대상 연도"}</th>
              <th scope="col">주최측 발표</th>
              {view === "both" && <th scope="col">데이터 기반 추정</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} data-event-id={row.id}>
                <th scope="row">
                  <button type="button" onClick={() => setEventId(row.id)}>
                    {row.eventName}
                  </button>
                  <small>
                    {row.year} · {row.region}
                  </small>
                </th>
                <td className="past-comparison-period">
                  {view === "announced"
                    ? `${row.year}년`
                    : (row.periodLabel ??
                      `${row.start ?? "시작일 미확인"} ~ ${row.end ?? "종료일 미확인"}`)}
                </td>
                <td>
                  <Quantity value={row.announced} />
                </td>
                {view === "both" && (
                  <td>
                    <Quantity value={row.observed} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {!visible.length && (
        <p role="status">
          {view === "both"
            ? "해당 연도에 주최측 발표와 데이터 기반 추정이 모두 있는 행사가 없습니다."
            : "해당 연도에 표시할 주최측 발표 방문객 자료가 없습니다."}
        </p>
      )}
      {selected && view === "both" && (
        <p className="insights-case-proposal">
          {selected.comparisonBasis?.observationPeriod && (
            <span>
              관측기간 {selected.comparisonBasis.observationPeriod.from} ~{" "}
              {selected.comparisonBasis.observationPeriod.to} ·{" "}
            </span>
          )}
          {selected.comparisonBasis?.scope ?? selected.limitation}
        </p>
      )}
      <p className="insights-caption">
        {visible.length.toLocaleString("ko-KR")}개 행사
      </p>
    </section>
  );
}
