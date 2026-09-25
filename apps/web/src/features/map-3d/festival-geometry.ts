// 예보 순간 최대 중앙값을 지도 위 기둥과 선택 범위의 작은 폴리곤으로 옮긴다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import type { FeatureCollection, Polygon } from "geojson";

// 위도에 따른 경도 길이를 보정해 미터 반경의 원을 만든다.
function circle(lng: number, lat: number, meters: number): Polygon {
  const latStep = meters / 111_320;
  const lngStep = latStep / Math.cos((lat * Math.PI) / 180);
  const ring = Array.from({ length: 17 }, (_, index) => {
    const angle = (index * Math.PI * 2) / 16;
    return [lng + Math.cos(angle) * lngStep, lat + Math.sin(angle) * latStep];
  });
  return { type: "Polygon", coordinates: [ring] };
}

// 큰 예보도 기둥이 시야를 가리지 않도록 로그 높이로 압축한다.
export function columnHeight(peakP50: number): number {
  return Math.min(130, Math.max(12, Math.log10(Math.max(0, peakP50) + 1) * 25));
}

// 한 행사에 한 기둥을 만들고 색 등급은 스타일 레이어에서 결정한다.
export function festivalColumns(
  festivals: FestivalSummary[],
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: festivals
      .filter(
        (festival) =>
          Number.isFinite(festival.lng) && Number.isFinite(festival.lat),
      )
      .map((festival) => ({
        type: "Feature",
        geometry: circle(festival.lng, festival.lat, 26),
        properties: {
          eventId: festival.eventId,
          level: festival.level,
          height: columnHeight(festival.peakP50),
        },
      })),
  };
}

// 선택한 행사만 반투명 예보 규모 원으로 표시한다.
export function festivalRings(
  festivals: FestivalSummary[],
  selectedId: string | null,
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: festivals
      .filter((festival) => festival.eventId === selectedId)
      .map((festival) => ({
        type: "Feature",
        geometry: circle(
          festival.lng,
          festival.lat,
          Math.min(450, Math.max(80, Math.log10(festival.peakP50 + 1) * 85)),
        ),
        properties: { eventId: festival.eventId },
      })),
  };
}
