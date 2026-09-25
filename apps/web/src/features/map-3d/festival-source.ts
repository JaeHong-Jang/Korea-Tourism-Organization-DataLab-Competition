// 행사 요약 목록을 지도 점과 등급 라벨의 GeoJSON으로 옮긴다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import type { FeatureCollection, Point } from "geojson";

// 목록에 보이는 행사만 좌표와 예보 규모 구간을 가진 점으로 옮긴다.
export function festivalGeoJson(
  festivals: FestivalSummary[],
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: festivals
      .filter(
        (festival) =>
          Number.isFinite(festival.lng) && Number.isFinite(festival.lat),
      )
      .map((festival) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [festival.lng, festival.lat],
        },
        properties: {
          eventId: festival.eventId,
          level: festival.level,
          size: festival.peakP50 < 1_000 ? 1 : festival.peakP50 < 5_000 ? 2 : 3,
          name: festival.name,
          grade:
            ["✓ 1등급", "! 2등급", "▲ 3등급", "◆ 4등급"][festival.level - 1] ??
            "◆ 4등급",
        },
      })),
  };
}
