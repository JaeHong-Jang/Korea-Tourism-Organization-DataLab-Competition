// 행사 원본 좌표의 대원거리로 반경을 제한하고 가까운 순서를 결정한다
import type { NearLocation } from "../analysis/draft-answer.js";
import type { Recommendation } from "./conditions.js";
import type { SearchOrigin } from "./location.js";

// 지구 반지름을 km로 고정하고 부동소수점 오차가 역삼각함수 범위를 넘지 않게 한다
export function distanceKm(from: NearLocation, to: NearLocation): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((to.lat - from.lat) * rad) / 2) ** 2 +
    Math.cos(from.lat * rad) *
      Math.cos(to.lat * rad) *
      Math.sin(((to.lng - from.lng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

// 필터·정렬에는 반올림 전 거리를 쓰고 화면 reason에만 정수 km를 표시한다
export function nearbyRecommendations(
  items: Recommendation["items"],
  origin: SearchOrigin,
) {
  const ranked = items
    .map(({ summary, reason }) => ({
      summary,
      reason,
      distance: distanceKm(origin, summary),
    }))
    .filter(
      ({ summary }) =>
        Math.abs(summary.lat) <= 90 && Math.abs(summary.lng) <= 180,
    )
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.summary.eventId.localeCompare(b.summary.eventId),
    );
  const radius = ranked.some((item) => item.distance <= 60) ? 60 : 120;
  return {
    radius,
    items: ranked
      .filter((item) => item.distance <= radius)
      .map(({ summary, reason, distance }) => ({
        summary,
        reason: `${origin.label}에서 약 ${Math.round(distance)} km · ${reason} · 가까운 거리순`,
      })),
  };
}
