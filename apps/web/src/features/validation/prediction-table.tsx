// 백테스트의 모든 예측·실측 값을 원본 단위 표로 제공한다.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex lint/a11y/noRedundantRoles: 가로 스크롤 표를 키보드로 탐색한다.
import type { BacktestSummary } from "@crowdcast/contracts/types";

const marks = { goldA: "◆", goldB: "■", silver: "●" };
const labels = { goldA: "골드 A", goldB: "골드 B", silver: "실버" };
const fmt = (value: number) => Math.round(value).toLocaleString("ko-KR");

// 로그 차트에서 빠진 0 이하 표본까지 표에는 그대로 남긴다.
export function PredictionTable({
  points,
}: {
  points: BacktestSummary["points"];
}) {
  return (
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
  );
}
