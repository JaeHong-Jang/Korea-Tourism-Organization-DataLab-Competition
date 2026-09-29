// 하루 평균 방문객의 규모와 예측 범위를 하나의 그래프로 연결한다.
import type { Insight } from "@crowdcast/contracts/types";
import { DailyForecastChart } from "./daily-forecast-chart";

// 시간대 정보가 없는 예보는 하루 단위로만 표시한다.
export function InsightLevels({ insight }: { insight: Insight }) {
  return <DailyForecastChart insight={insight} />;
}
