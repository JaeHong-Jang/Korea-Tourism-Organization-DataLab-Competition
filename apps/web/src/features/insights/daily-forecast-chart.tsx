// 행사별 일평균 막대에 규모 등급과 예측 범위를 함께 표시한다.
import type { Insight } from "@crowdcast/contracts/types";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  dailyScale,
  type ScaleBand,
  scaleName,
  scaleRange,
} from "./daily-scale-data";
import { type ForecastPeople, forecastPeople } from "./forecast-people-data";

const COLORS = ["var(--seq-2)", "var(--seq-4)", "var(--seq-5)"];
const number = (value: number) => value.toLocaleString("ko-KR");

// 모든 행의 막대와 불확실성 구간을 같은 축 위에 그린다.
function ForecastBar({
  row,
  maximum,
  band,
}: {
  row: ForecastPeople;
  maximum: number;
  band: ScaleBand;
}) {
  const { p10, p50, p90 } = row.dailyMean;
  const x = (value: number) => 4 + (value / maximum) * 992;
  return (
    <li className="daily-forecast-row" data-forecast-id={row.forecastId}>
      <div className="daily-forecast-name">
        <Link to={`/f/${encodeURIComponent(row.forecastId)}`}>{row.name}</Link>
        <span>
          {row.start.slice(5)} ~ {row.end.slice(5)}
        </span>
        <span className="daily-forecast-grade">
          {scaleName(band.grade)} · {band.grade}등급 · {scaleRange(band)}
        </span>
      </div>
      <svg
        className="daily-forecast-bar"
        viewBox="0 0 1000 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${row.name}: 일평균 ${number(p50)}명/일, ${scaleName(band.grade)} ${band.grade}등급`}
        data-maximum={maximum}
        data-p10={p10}
        data-p50={p50}
        data-p90={p90}
        data-grade={band.grade}
      >
        <rect
          x="4"
          y="11"
          width={x(p50) - 4}
          height="18"
          rx="3"
          fill={COLORS[band.grade - 1]}
        />
      </svg>
      <div className="daily-forecast-value">
        <strong>
          {number(p50)}
          <small> 명/일</small>
        </strong>
      </div>
    </li>
  );
}

// 행사 선택·필터는 표시할 행만 바꾸고 전체 예보의 등급 경계와 축은 유지한다.
export function DailyForecastChart({ insight }: { insight: Insight }) {
  const rows = forecastPeople(insight);
  const [selectedId, setSelectedId] = useState("");
  const [grade, setGrade] = useState("");
  const [order, setOrder] = useState("date");
  if (!rows) return <p role="status">일평균 예측 자료를 확인할 수 없습니다.</p>;
  if (!rows.length) return <p role="status">예보 대상 행사가 없습니다.</p>;
  const scale = dailyScale(insight, rows);
  if (!scale) return <p role="status">규모 등급 기준을 확인할 수 없습니다.</p>;
  const maximum = Math.max(1, ...rows.map((row) => row.dailyMean.p50));
  const filtered = rows
    .filter(
      (row) =>
        (!selectedId || row.forecastId === selectedId) &&
        (!grade || row.dailyScaleGrade === Number(grade)),
    )
    .sort(
      (a, b) =>
        (order === "size" ? b.dailyMean.p50 - a.dailyMean.p50 : 0) ||
        a.start.localeCompare(b.start) ||
        a.name.localeCompare(b.name, "ko"),
    );
  return (
    <section
      className="daily-forecast"
      aria-label="일평균 방문객 규모 등급 그래프"
    >
      <section className="daily-scale-key" aria-label="일평균 규모 등급 기준">
        {scale.bands.map((band) => (
          <span
            key={band.grade}
            style={{ borderColor: COLORS[band.grade - 1] }}
          >
            <strong>
              {scaleName(band.grade)} · {band.grade}등급
            </strong>{" "}
            {scaleRange(band)}
          </span>
        ))}
      </section>
      <div className="daily-forecast-controls">
        <label className="insights-event-picker">
          행사 선택
          <select
            aria-label="행사 선택"
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setGrade("");
            }}
          >
            <option value="">전체 행사 ({rows.length}개)</option>
            {[...rows]
              .sort(
                (a, b) =>
                  a.start.localeCompare(b.start) ||
                  a.name.localeCompare(b.name, "ko"),
              )
              .map((row) => (
                <option key={row.forecastId} value={row.forecastId}>
                  {row.start} · {row.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          일평균 규모 등급
          <select
            aria-label="일평균 규모 등급"
            value={grade}
            onChange={(event) => {
              setGrade(event.target.value);
              setSelectedId("");
            }}
          >
            <option value="">전체 등급</option>
            {scale.bands.map((band) => (
              <option key={band.grade} value={band.grade}>
                {scaleName(band.grade)} · {band.grade}등급 · {scaleRange(band)}
              </option>
            ))}
          </select>
        </label>
        <label className="daily-forecast-sort">
          정렬
          <select
            aria-label="행사 정렬"
            value={order}
            onChange={(event) => {
              setOrder(event.target.value);
            }}
          >
            <option value="date">개최일순</option>
            <option value="size">방문객 많은 순</option>
          </select>
        </label>
      </div>
      <div className="daily-forecast-legend">
        <span>막대: 일평균 예측 중앙값</span>

        <span>단위: 명/일</span>
      </div>
      <div className="daily-forecast-axis" aria-hidden="true">
        <span>0</span>
        <span>{number(maximum)}</span>
      </div>
      <ul className="daily-forecast-list">
        {filtered.map((row) => (
          <ForecastBar
            key={row.forecastId}
            row={row}
            maximum={maximum}
            band={scale.bands[(row.dailyScaleGrade as number) - 1]}
          />
        ))}
      </ul>
      {!filtered.length && <p role="status">조건에 맞는 행사가 없습니다.</p>}
      <div className="daily-forecast-footer">
        <span>{filtered.length}개 행사</span>
      </div>
      <p className="insights-caption">추정 산식 기반 · 일평균 방문객 기준</p>
    </section>
  );
}
