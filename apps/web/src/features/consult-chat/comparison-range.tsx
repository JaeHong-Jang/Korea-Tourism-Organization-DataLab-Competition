// 두 예보의 같은 지표를 한 로그 축에 나란히 그린다.
import type { ForecastCard } from "@crowdcast/contracts/types";
import { formatSnapshotNumber } from "../../lib/format";

type Quantity = ForecastCard["peakConcurrent"] | ForecastCard["dailyMean"];

// 화면 수치는 계약 원본을 그대로 쓰고 위치 계산에만 로그 축을 적용한다.
export function ComparisonRange({
  title,
  original,
  changed,
}: {
  title: string;
  original: Quantity;
  changed: Quantity;
}) {
  const values = [original, changed];
  const maximum =
    10 **
    Math.ceil(
      Math.log10(Math.max(100_000, original.p90 ?? 0, changed.p90 ?? 0)),
    );
  const position = (value: number) =>
    `${(Math.log10(Math.max(1, value)) / Math.log10(maximum)) * 100}%`;

  // 두 막대는 같은 좌표 함수를 공유하고 접근성 이름에 원본 구간값을 적는다.
  return (
    <figure
      className="consult-compare-range"
      aria-label={`${title} 같은 축 비교`}
    >
      <figcaption>{title} · 같은 로그 눈금</figcaption>
      {values.map((quantity, index) => {
        const label = index === 0 ? "원래 예보" : "바뀐 예보";
        const { p10, p50, p90 } = quantity;
        return (
          <div className="consult-compare-range__row" key={label}>
            <span>{label}</span>
            {p10 != null && p50 != null && p90 != null ? (
              <div
                className="consult-compare-range__track"
                role="img"
                aria-label={`${label} ${formatSnapshotNumber(p10)}~${formatSnapshotNumber(p90)}${quantity.unit}, 중앙 ${formatSnapshotNumber(p50)}${quantity.unit}`}
              >
                <span
                  className="consult-compare-range__band"
                  style={{
                    left: position(p10),
                    width: `calc(${position(p90)} - ${position(p10)})`,
                  }}
                />
                <span
                  className="consult-compare-range__median"
                  style={{ left: position(p50) }}
                />
              </div>
            ) : (
              <span>구간 없음</span>
            )}
          </div>
        );
      })}
      <p className="consult-compare-range__legend">
        구간 p10–p90 · 세로선 p50 · 추정 산식 기반
      </p>
    </figure>
  );
}
