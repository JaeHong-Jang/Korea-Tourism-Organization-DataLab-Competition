// 방문 문장에서 출발 지명을 추출하고 모호한 지오코딩 후보는 선택으로 남긴다
import type { GeocodeCandidate } from "../../clients/geocode-schema.js";
import type { NearLocation } from "../analysis/draft-answer.js";

export const nearbyWords = /가까운|가까이|근처|주변|여기서|인근|부근/;
const filler =
  /^(?:그냥|저는|나는|지금|현재|이번|다음|주말|오늘|내일|축제|행사|불꽃|불꽃놀이|먹거리|꽃|공연|전통|한적한|조용한|갈|만한|곳|여기|여기서|우리|추천|좀)$/;

// 조사와 가까운 표현 앞의 연속 지명만 남겨 문장 전체를 지오코더에 보내지 않는다
export function extractRecommendationPlace(text: string): string | null {
  const marker =
    /에서/.exec(text) ?? /근처|주변|가까운|가까이|인근|부근/.exec(text);
  if (!marker) return null;
  const words = text.slice(0, marker.index).trim().split(/\s+/);
  const place: string[] = [];
  for (const word of words.reverse()) {
    if (!/^[가-힣]+$/.test(word) || filler.test(word)) break;
    place.unshift(word);
    if (place.length === 3) break;
  }
  return place.length ? place.join(" ") : null;
}

export type SearchOrigin = NearLocation & { label: string };

// 같은 시군구 후보는 높은 점수로 합치고 동점 지역을 코드 순으로 임의 확정하지 않는다
export function chooseOrigin(candidates: GeocodeCandidate[]): {
  origin?: SearchOrigin;
  choices: GeocodeCandidate[];
} {
  const byRegion = new Map<string, GeocodeCandidate>();
  for (const candidate of candidates) {
    if (
      !Number.isFinite(candidate.lat) ||
      Math.abs(candidate.lat) > 90 ||
      !Number.isFinite(candidate.lng) ||
      Math.abs(candidate.lng) > 180 ||
      !Number.isFinite(candidate.score)
    )
      continue;
    const previous = byRegion.get(candidate.sigunguCode);
    if (!previous || candidate.score > previous.score)
      byRegion.set(candidate.sigunguCode, candidate);
  }
  const choices = [...byRegion.values()].sort((a, b) => b.score - a.score);
  const first = choices[0];
  if (first && (choices.length === 1 || first.score - choices[1].score >= 0.1))
    return {
      origin: { lat: first.lat, lng: first.lng, label: first.sigunguName },
      choices: [],
    };
  return { choices };
}
