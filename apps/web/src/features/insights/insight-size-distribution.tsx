// 동일한 예보 표본의 인원 구간을 관리 등급과 별도로 보여 준다.
import type { Insight } from "@crowdcast/contracts/types";
import { getFestivals } from "../../lib/api-client";
import { peakDistribution } from "./festival-analysis";
import { InsightDistribution } from "./insight-distribution";
import { matchInsightFestivals } from "./insight-festival-matching";
import { InsightFestivals } from "./insight-festivals";
import { useInsightResource } from "./use-insight-resource";

// 기준 시점과 예보 식별자가 일치할 때만 행사 목록에서 규모 분포를 계산한다.
export function InsightSizeDistribution({ insight }: { insight: Insight }) {
  const { state, retry } = useInsightResource(getFestivals);
  if (insight.sampleSize === 0)
    return <p role="status">분석에 포함된 예보가 없어요.</p>;
  if (state.status === "loading")
    return <p role="status">예상 인원을 확인하고 있어요.</p>;
  if (state.status !== "ready" || !state.value)
    return (
      <div>
        <p role="alert">예상 인원 자료를 불러오지 못했어요.</p>
        <button type="button" onClick={retry}>
          인원 자료 다시 확인
        </button>
      </div>
    );
  const rows = matchInsightFestivals(insight, state.value);
  if (!rows)
    return (
      <p role="status">
        분석 예보와 현재 행사 목록의 일치를 확인할 수 없어 인원 분포를 표시하지
        않아요.
      </p>
    );
  return (
    <div className="insights-section-stack">
      <InsightDistribution
        title="순간 최대 동시 인원 · 예측 중앙값"
        headingLevel={3}
        rows={peakDistribution(rows)}
        size={rows.length}
      />
      <p>
        인원 구간은 규모를 살펴보기 위한 구분이에요. 안전 등급이나 실제 방문객
        수가 아니에요.
      </p>
      <InsightFestivals insight={insight} />
    </div>
  );
}
