// 행사 목록 전체에 공통인 인형 축척과 품질별 수량을 정한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import type { SceneQuality } from "./quality";

const limit = { high: 2000, medium: 1000, low: 500 } satisfies Record<
  SceneQuality,
  number
>;

// 사람이 읽기 쉬운 1·2·5 눈금으로만 축척을 올린다.
function nextScale(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = value / magnitude;
  return (step < 2 ? 2 : step < 5 ? 5 : 10) * magnitude;
}

// 최소 한 개를 보장하면서 반올림한 합이 품질 상한 안에 드는 축척을 찾는다.
export function crowdScale(
  festivals: FestivalSummary[],
  quality: SceneQuality,
) {
  if (festivals.length === 0)
    return { peoplePerDoll: 100, counts: [], total: 0 };
  const peaks = festivals.map((festival) => Math.max(0, festival.peakP50));
  let peoplePerDoll = 100;
  let counts = peaks.map((peak) =>
    Math.max(1, Math.round(peak / peoplePerDoll)),
  );
  while (
    counts.reduce((sum, count) => sum + count, 0) > limit[quality] &&
    peoplePerDoll < 1e12
  ) {
    peoplePerDoll = nextScale(peoplePerDoll);
    counts = peaks.map((peak) => Math.max(1, Math.round(peak / peoplePerDoll)));
  }
  return {
    peoplePerDoll,
    counts,
    total: counts.reduce((sum, count) => sum + count, 0),
  };
}
