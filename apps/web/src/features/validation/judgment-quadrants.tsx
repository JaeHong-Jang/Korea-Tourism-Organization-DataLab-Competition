// 예측과 실측의 수립 대상 여부를 같은 환산 기준으로 교차 집계한다.
import type { BacktestSummary } from "@crowdcast/contracts/types";

// 등급이 빠진 옛 응답은 일부 표본만으로 사분면을 채우지 않는다.
export function JudgmentQuadrants({
  points,
  belowThresholdActual,
}: {
  points: BacktestSummary["points"];
  belowThresholdActual?: number;
}) {
  if (points.some((point) => point.level == null || point.actualLevel == null))
    return (
      <p className="validation-assumption">
        환산 판정 사분면은 등급 자료가 없어 보류해요 · 가정(순간 최대 환산)
      </p>
    );

  // 두 등급 모두 3 이상일 때 수립 대상으로 집계한다.
  const counts = [0, 0, 0, 0];
  for (const point of points) {
    const predicted = Number((point.level ?? 0) >= 3);
    const actual = Number((point.actualLevel ?? 0) >= 3);
    counts[predicted * 2 + actual] += 1;
  }

  return (
    <div className="validation-quadrant-wrap">
      <h3>환산 판정 사분면 · 가정(순간 최대 환산)</h3>
      <dl className="validation-quadrants">
        <div>
          <dt>예측 미만 · 실측 미만</dt>
          <dd>{counts[0]}건</dd>
        </div>
        <div>
          <dt>예측 미만 · 실측 대상</dt>
          <dd>{counts[1]}건</dd>
        </div>
        <div>
          <dt>예측 대상 · 실측 미만</dt>
          <dd>{counts[2]}건</dd>
        </div>
        <div>
          <dt>예측 대상 · 실측 대상</dt>
          <dd>{counts[3]}건</dd>
        </div>
      </dl>
      {belowThresholdActual === 0 && (
        <p className="validation-assumption">
          실측 대상 미만 0건이라 경계 구분은 아직 볼 수 없어요.
        </p>
      )}
    </div>
  );
}
