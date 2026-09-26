// 예측과 실측의 같은 로그 척도 산점도와 표를 제공한다.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex lint/a11y/noRedundantRoles lint/a11y/noStaticElementInteractions: SVG 점과 표 스크롤을 키보드로 탐색한다.
import type { BacktestSummary } from "@crowdcast/contracts/types";
import { useState } from "react";
import type { ContractState } from "../../lib/validation/use-contract";
import { ContractMessage } from "./contract-state";
import { JudgmentQuadrants } from "./judgment-quadrants";

const marks = { goldA: "◆", goldB: "■", silver: "●" };
const labels = { goldA: "골드 A", goldB: "골드 B", silver: "실버" };
const fmt = (value: number) => Math.round(value).toLocaleString("ko-KR");

// 모든 점과 구간을 동일한 x·y 로그 범위에 놓아 기준선이 대각선이 되게 한다.
export function PredictionScatter({
  state,
}: {
  state: ContractState<BacktestSummary>;
}) {
  const [view, setView] = useState<"chart" | "table">(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(max-width: 480px)").matches
      ? "table"
      : "chart",
  );
  const [activePoint, setActivePoint] = useState<string | null>(null);
  if (!state.value)
    return (
      <ContractMessage
        state={state}
        empty="예측과 실측을 비교할 자료가 아직 없어요."
      />
    );
  const points = state.value.points;
  if (!points.length)
    return <p className="validation-state">비교할 행사 표본이 아직 없어요.</p>;
  // 로그 축에 놓을 수 없는 값은 점에서 제외하되 원본 표에는 모두 남긴다.
  const visiblePoints = points.filter(
    (point) => point.p50 > 0 && point.actual > 0,
  );
  const values = visiblePoints
    .flatMap((point) => [point.p10, point.p50, point.p90, point.actual])
    .filter((value) => value > 0);
  const low = values.length
    ? 10 ** Math.floor(Math.log10(Math.min(...values)))
    : 1;
  const high = values.length
    ? 10 ** Math.ceil(Math.log10(Math.max(...values) * 1.01))
    : 10;
  const scale = (value: number) =>
    100 +
    ((Math.log10(value) - Math.log10(low)) /
      (Math.log10(high) - Math.log10(low))) *
      440;
  const ticks = Array.from(
    { length: Math.round(Math.log10(high / low)) + 1 },
    (_, index) => low * 10 ** index,
  );
  const clippedLowCount = visiblePoints.filter(
    (point) => point.p10 <= 0,
  ).length;
  const omittedCount = points.length - visiblePoints.length;
  // 같은 예측·실측 좌표는 하나로 묶어 겹친 표본 수를 직접 적는다.
  const grouped = new Map<
    string,
    {
      point: (typeof points)[number];
      count: number;
      covered: number;
      names: string[];
    }
  >();
  for (const point of visiblePoints) {
    const key = `${point.p50}|${point.actual}`;
    const group = grouped.get(key) ?? {
      point,
      count: 0,
      covered: 0,
      names: [],
    };
    group.count += 1;
    group.covered += Number(
      point.p10 <= point.actual && point.actual <= point.p90,
    );
    group.names.push(`${point.name} (${point.year} · ${labels[point.tier]})`);
    grouped.set(key, group);
  }
  return (
    <div className="validation-content">
      <div className="validation-chart-tools">
        <span className="validation-legend">
          <span className="validation-legend--covered">
            <i aria-hidden="true">●</i> 80% 구간에 실측 포함
          </span>{" "}
          ·{" "}
          <span className="validation-legend--outside">
            <i aria-hidden="true">◆</i> 구간 밖
          </span>
        </span>
        <button
          type="button"
          onClick={() => setView(view === "chart" ? "table" : "chart")}
        >
          {view === "chart" ? "표로 보기" : "차트 보기"}
        </button>
      </div>
      <JudgmentQuadrants
        points={points}
        belowThresholdActual={state.value.disclosure?.belowThresholdActual}
      />
      {clippedLowCount > 0 && (
        <p className="validation-assumption">
          p10이 0 이하인 {clippedLowCount}건은 점을 가리키면 구간 시작을 왼쪽
          화살표로 표시해요. 0 이하 — 표 참고.
        </p>
      )}
      {omittedCount > 0 && (
        <p className="validation-assumption">
          예측 p50이나 실측이 0 이하인 {omittedCount}건은 로그 축에 표시하지
          않아요. 표에서 원본 값을 확인하세요.
        </p>
      )}
      {view === "chart" ? (
        visiblePoints.length ? (
          <div className="validation-svg-wrap">
            <svg
              viewBox="0 0 600 580"
              role="img"
              aria-label={`예측과 실측 로그 산점도, ${visiblePoints.length}개 점`}
            >
              <line
                x1="100"
                y1="510"
                x2="540"
                y2="70"
                className="validation-diagonal"
              />
              <text x="360" y="241" className="validation-diagonal-label">
                예측 = 실측
              </text>
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={scale(tick)}
                    y1="510"
                    x2={scale(tick)}
                    y2="514"
                    className="validation-axis"
                  />
                  <line
                    x1="96"
                    y1={610 - scale(tick)}
                    x2="100"
                    y2={610 - scale(tick)}
                    className="validation-axis"
                  />
                  <text x={scale(tick)} y="531" textAnchor="middle">
                    {fmt(tick)}
                  </text>
                  <text x="87" y={614 - scale(tick)} textAnchor="end">
                    {fmt(tick)}
                  </text>
                </g>
              ))}
              <line
                x1="100"
                y1="510"
                x2="540"
                y2="510"
                className="validation-axis"
              />
              <line
                x1="100"
                y1="70"
                x2="100"
                y2="510"
                className="validation-axis"
              />
              {Array.from(grouped, ([key, group]) => {
                const point = group.point;
                const y = 610 - scale(point.actual);
                const x = scale(point.p50);
                const covered = group.covered === group.count;
                const active = activePoint === key;
                const detail = `${group.names.join(", ")} · 실측 ${fmt(point.actual)}명/일 · 예측 ${fmt(point.p50)}명/일 · ${group.covered}건 포함, ${group.count - group.covered}건 구간 밖${group.count > 1 ? " · 각 구간은 표 참고" : ` · 구간 ${fmt(point.p10)}~${fmt(point.p90)}명/일`}`;
                return (
                  <g
                    key={key}
                    data-point={point.eventId}
                    data-coverage={covered ? "covered" : "outside"}
                    className={`validation-point validation-point--${covered ? "covered" : "outside"}`}
                    tabIndex={0}
                    aria-label={detail}
                    onMouseEnter={() => setActivePoint(key)}
                    onMouseLeave={() => setActivePoint(null)}
                    onFocus={() => setActivePoint(key)}
                    onBlur={() => setActivePoint(null)}
                  >
                    {active && point.p90 > 0 && (
                      <>
                        <line
                          x1={point.p10 > 0 ? scale(point.p10) : 100}
                          y1={y}
                          x2={scale(point.p90)}
                          y2={y}
                          className="validation-whisker"
                        />
                        {point.p10 <= 0 && (
                          <text x="100" y={y - 6} textAnchor="middle">
                            ←
                          </text>
                        )}
                      </>
                    )}
                    {covered ? (
                      <circle cx={x} cy={y} r="6" />
                    ) : (
                      <rect
                        x={x - 5}
                        y={y - 5}
                        width="10"
                        height="10"
                        transform={`rotate(45 ${x} ${y})`}
                      />
                    )}
                    {group.count > 1 && (
                      <text
                        x={x + 9}
                        y={y - 9}
                        className="validation-overlap-count"
                      >
                        {group.count}건 겹침
                      </text>
                    )}
                    <title>{detail}</title>
                  </g>
                );
              })}
              <text x="320" y="563" textAnchor="middle">
                예측 p50 (명/일 · 로그 축)
              </text>
              <text x="100" y="28" textAnchor="start">
                실측 (명/일 · 로그 축)
              </text>
            </svg>
          </div>
        ) : (
          <p className="validation-state">
            로그 축에 표시할 양수 표본이 없어요. 표에서 원본 값을 확인하세요.
          </p>
        )
      ) : (
        <section
          className="validation-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="예측·실측 표, 좌우로 스크롤"
        >
          <table>
            <thead>
              <tr>
                <th>행사</th>
                <th>연도</th>
                <th>등급</th>
                <th>예측 p10~p90 (명/일)</th>
                <th>p50 (명/일)</th>
                <th>실측 (명/일)</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={`${point.eventId}-${point.year}-${point.tier}`}>
                  <th>{point.name}</th>
                  <td>{point.year}</td>
                  <td>
                    {marks[point.tier]} {labels[point.tier]}
                  </td>
                  <td>
                    {fmt(point.p10)}~{fmt(point.p90)}
                  </td>
                  <td>{fmt(point.p50)}</td>
                  <td>{fmt(point.actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
