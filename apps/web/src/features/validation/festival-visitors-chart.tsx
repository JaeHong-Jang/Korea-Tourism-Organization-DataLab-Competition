// 2017~2025년 축제 총 방문객(주최 측 발표 합계)과 2026년 예측을 한 꺾은선으로 잇고, 예측은 원 색으로만 구분한다.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex lint/a11y/noRedundantRoles lint/a11y/noStaticElementInteractions: SVG 연도 점과 표 스크롤을 키보드로 탐색한다.
import { useState } from "react";
import { festivalVisitors } from "./festival-visitors-data";

const WIDTH = 900;
const HEIGHT = 400;
const LEFT = 96;
const RIGHT = 30;
const TOP = 36;
const BOTTOM = 64;

// 큰 수는 "1.58억"처럼, 설명 줄에서는 "1억 5,810만 명"처럼 적는다.
const short = (value: number) =>
  value >= 1e8
    ? `${(value / 1e8).toFixed(2)}억`
    : `${Math.round(value / 1e4).toLocaleString("ko-KR")}만`;
const long = (value: number) => {
  const eok = Math.floor(value / 1e8);
  const man = Math.round((value % 1e8) / 1e4);
  return `${eok ? `${eok}억 ` : ""}${man.toLocaleString("ko-KR")}만 명`;
};

type Point = (typeof festivalVisitors.points)[number];
const describePoint = (point: Point) =>
  `${point.year}년 · ${long(point.total)} · 보고 축제 ${point.reported.toLocaleString("ko-KR")}개${point.covid ? " · 코로나 영향" : ""}`;
const describeForecast = () => {
  const { value, low, high } = festivalVisitors.forecast;
  return `2026년 예측 · ${long(value)} (범위 ${long(low)} ~ ${long(high)}) · 최근 추세 연장`;
};

// 연도는 같은 간격, 방문객은 0부터 시작하는 눈금에 놓는다.
export function FestivalVisitorsChart() {
  const { points, forecast } = festivalVisitors;
  const [view, setView] = useState<"chart" | "table">(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(max-width: 480px)").matches
      ? "table"
      : "chart",
  );
  const [active, setActive] = useState<number | null>(null);
  const years = [...points.map((point) => point.year), forecast.year];
  const top = Math.max(...points.map((point) => point.total), forecast.high);
  const step = 5e7;
  const max = Math.ceil((top * 1.08) / step) * step;
  const x = (year: number) =>
    LEFT +
    ((year - years[0]) / (forecast.year - years[0])) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) =>
    HEIGHT - BOTTOM - (value / max) * (HEIGHT - TOP - BOTTOM);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const line = [
    ...points.map((point) => [point.year, point.total]),
    [forecast.year, forecast.value],
  ]
    .map(([year, value]) => `${x(year)},${y(value)}`)
    .join(" ");
  const last = points[points.length - 1];
  const covid = points.filter((point) => point.covid);
  const band = covid.length
    ? { from: x(covid[0].year) - 18, to: x(covid[covid.length - 1].year) + 18 }
    : null;

  return (
    <div className="validation-content">
      <div className="validation-chart-tools">
        <span className="validation-legend">
          <span className="festival-legend--actual">
            <i aria-hidden="true">━</i> 실제(주최 측 발표 합계)
          </span>
          <span className="festival-legend--forecast">
            <i aria-hidden="true">●</i> 2026 예측
          </span>
          <span className="festival-legend--covid">
            <i aria-hidden="true">■</i> 코로나 영향(보고 축제 적음)
          </span>
        </span>
        <button
          type="button"
          onClick={() => setView(view === "chart" ? "table" : "chart")}
        >
          {view === "chart" ? "표로 보기" : "차트 보기"}
        </button>
      </div>
      {view === "chart" ? (
        <div className="validation-svg-wrap festival-chart">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`축제 총 방문객 2017~2025년 실제와 2026년 예측. 2025년 ${long(last.total)}, 2026년 예측 ${long(forecast.value)}`}
          >
            {band && (
              <g className="festival-covid">
                <rect
                  x={band.from}
                  y={TOP}
                  width={band.to - band.from}
                  height={HEIGHT - TOP - BOTTOM}
                />
                <text
                  x={(band.from + band.to) / 2}
                  y={TOP - 10}
                  textAnchor="middle"
                >
                  코로나 영향
                </text>
              </g>
            )}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={LEFT}
                  y1={y(tick)}
                  x2={WIDTH - RIGHT}
                  y2={y(tick)}
                  className={`validation-grid${tick === 0 ? " is-major" : ""}`}
                />
                <text x={LEFT - 10} y={y(tick) + 4} textAnchor="end">
                  {tick === 0 ? "0" : short(tick)}
                </text>
              </g>
            ))}
            <polyline className="festival-line" points={line} />
            {points.map((point) => (
              <g
                key={point.year}
                data-year={point.year}
                className={`festival-point${point.covid ? " is-covid" : ""}${active === point.year ? " is-active" : ""}`}
                tabIndex={0}
                aria-label={describePoint(point)}
                onMouseEnter={() => setActive(point.year)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(point.year)}
                onBlur={() => setActive(null)}
              >
                <circle
                  className="festival-hit"
                  cx={x(point.year)}
                  cy={y(point.total)}
                  r="18"
                />
                <circle
                  className="festival-dot"
                  cx={x(point.year)}
                  cy={y(point.total)}
                  r="5"
                />
                <text
                  x={x(point.year)}
                  y={y(point.total) - 12}
                  textAnchor="middle"
                  className="festival-value"
                >
                  {short(point.total)}
                </text>
                <title>{describePoint(point)}</title>
              </g>
            ))}
            <g
              data-year={forecast.year}
              className={`festival-point is-forecast${active === forecast.year ? " is-active" : ""}`}
              tabIndex={0}
              aria-label={describeForecast()}
              onMouseEnter={() => setActive(forecast.year)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(forecast.year)}
              onBlur={() => setActive(null)}
            >
              <circle
                className="festival-hit"
                cx={x(forecast.year)}
                cy={y(forecast.value)}
                r="18"
              />
              <circle
                className="festival-dot"
                cx={x(forecast.year)}
                cy={y(forecast.value)}
                r="6"
              />
              <text
                x={x(forecast.year)}
                y={y(forecast.value) - 12}
                textAnchor="middle"
                className="festival-value"
              >
                {short(forecast.value)}
              </text>
              <title>{describeForecast()}</title>
            </g>
            {years.map((year) => (
              <text
                key={year}
                x={x(year)}
                y={HEIGHT - BOTTOM + 22}
                textAnchor="middle"
              >
                {year}
              </text>
            ))}
            <text
              className="festival-axis-title"
              x={(LEFT + WIDTH - RIGHT) / 2}
              y={HEIGHT - 10}
              textAnchor="middle"
            >
              연도
            </text>
            <text
              className="festival-axis-title"
              x={-(TOP + HEIGHT - BOTTOM) / 2}
              y={18}
              transform="rotate(-90)"
              textAnchor="middle"
            >
              총 방문객 (명)
            </text>
          </svg>
        </div>
      ) : (
        <section
          className="validation-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="연도별 축제 총 방문객 표, 좌우로 스크롤"
        >
          <table>
            <thead>
              <tr>
                <th>연도</th>
                <th>총 방문객</th>
                <th>보고 축제 수</th>
                <th>구분</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.year}>
                  <th>{point.year}</th>
                  <td>{point.total.toLocaleString("ko-KR")}명</td>
                  <td>{point.reported.toLocaleString("ko-KR")}개</td>
                  <td>{point.covid ? "실제 · 코로나 영향" : "실제"}</td>
                </tr>
              ))}
              <tr>
                <th>{forecast.year}</th>
                <td>
                  {forecast.value.toLocaleString("ko-KR")}명 (
                  {forecast.low.toLocaleString("ko-KR")}~
                  {forecast.high.toLocaleString("ko-KR")})
                </td>
                <td>—</td>
                <td>예측</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
      <p className="validation-source festival-source">
        출처: 문체부 지역 축제 개최계획, 주최 측 발표 방문객
      </p>
    </div>
  );
}
