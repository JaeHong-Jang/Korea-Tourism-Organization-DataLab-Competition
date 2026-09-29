// 과거 행사의 비교 자료와 발표값 목록을 전환해 표시한다.
import type { Insight } from "@crowdcast/contracts/types";
import { PastEventComparison } from "./past-event-comparison";

// 두 값이 있는 비교 목록과 발표값 전용 목록을 구분한다.
export function InsightComparison({ insight }: { insight: Insight }) {
  return <PastEventComparison insight={insight} />;
}
