// 로컬 타일·한글 라벨과 등급 토큰으로 낮·밤 지도 스타일을 만든다.

import type { FestivalSummary } from "@crowdcast/contracts/types";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { FeatureCollection, Point } from "geojson";
import type { StyleSpecification } from "maplibre-gl";

export const FESTIVAL_SOURCE = "festivals";
export const FESTIVAL_POINTS = "festival-points";
export const FESTIVAL_CLUSTERS = "festival-clusters";
export const KOREA_BOUNDS: [[number, number], [number, number]] = [
  [125.7, 33.0],
  [131.0, 38.7],
];

// 브라우저가 제공하는 의미 색을 읽어 지도 점에도 같은 등급 팔레트를 쓴다.
export function mapColors(element: Element = document.documentElement) {
  const css = getComputedStyle(element);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    levels: [1, 2, 3, 4].map((level) => token(`--level-${level}`)),
    surface: token("--surface"),
    ink: token("--ink"),
    focus: token("--focus"),
  };
}

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
        },
      })),
  };
}

// MapLibre가 PMTiles 프로토콜로 같은 출처의 아카이브만 요청하게 한다.
export function mapStyle(
  theme: "day" | "night",
  festivals: FestivalSummary[],
  colors = mapColors(),
  origin = window.location.origin,
): StyleSpecification {
  const flavor = theme === "night" ? "dark" : "light";
  return {
    version: 8,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${new URL("/tiles/korea-z13.pmtiles", origin).href}`,
        attribution: "© OpenStreetMap · Protomaps",
      },
      [FESTIVAL_SOURCE]: {
        type: "geojson",
        data: festivalGeoJson(festivals),
        cluster: true,
        clusterRadius: 28,
        clusterMaxZoom: 13,
      },
    },
    glyphs: "/tiles/fonts/{fontstack}/{range}.pbf",
    sprite: `/tiles/sprites/v4/${flavor}`,
    layers: [
      ...layers("protomaps", namedFlavor(flavor), { lang: "ko" }),
      {
        id: FESTIVAL_CLUSTERS,
        type: "circle",
        source: FESTIVAL_SOURCE,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": colors.surface,
          "circle-stroke-color": colors.focus,
          "circle-stroke-width": 2,
          "circle-radius": ["step", ["get", "point_count"], 17, 10, 21, 30, 25],
        },
      },
      {
        id: "festival-cluster-count",
        type: "symbol",
        source: FESTIVAL_SOURCE,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Medium"],
          "text-size": 12,
        },
        paint: { "text-color": colors.ink },
      },
      {
        id: FESTIVAL_POINTS,
        type: "circle",
        source: FESTIVAL_SOURCE,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "level"],
            1,
            colors.levels[0],
            2,
            colors.levels[1],
            3,
            colors.levels[2],
            4,
            colors.levels[3],
            colors.levels[0],
          ],
          "circle-radius": ["match", ["get", "size"], 1, 7, 2, 10, 3, 13, 7],
          "circle-stroke-color": colors.surface,
          "circle-stroke-width": 2,
        },
      },
      {
        id: "festival-selected",
        type: "circle",
        source: FESTIVAL_SOURCE,
        filter: ["==", ["get", "eventId"], ""],
        paint: {
          "circle-color": colors.focus,
          "circle-opacity": 0,
          "circle-radius": 17,
          "circle-stroke-color": colors.focus,
          "circle-stroke-width": 3,
        },
      },
    ],
  };
}
