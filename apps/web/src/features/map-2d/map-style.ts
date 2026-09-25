// 로컬 타일·한글 라벨과 등급 토큰으로 낮·밤 지도 스타일을 만든다.

import type { FestivalSummary } from "@crowdcast/contracts/types";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { FeatureCollection, Point } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import { festivalColumns, festivalRings } from "../map-3d/festival-geometry";

export const FESTIVAL_SOURCE = "festivals";
export const FESTIVAL_POINTS = "festival-points";
export const FESTIVAL_CLUSTERS = "festival-clusters";
export const FESTIVAL_COLUMNS = "festival-columns";
export const BUILDING_EXTRUSION = "building-extrusion";
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
    earth: token("--map-earth"),
    green: token("--map-green"),
    water: token("--map-water"),
    road: token("--map-road"),
    roadEdge: token("--map-road-edge"),
    rail: token("--map-rail"),
    building: token("--map-building"),
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
          name: festival.name,
          grade:
            ["✓ 1등급", "! 2등급", "▲ 3등급", "◆ 4등급"][festival.level - 1] ??
            "◆ 4등급",
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
  // 베이스맵의 땅·녹지·물·도로를 지도 전용 디자인 토큰으로 맞춘다.
  const base = layers("protomaps", namedFlavor(flavor), { lang: "ko" }).map(
    (layer) => {
      if (layer.id === "buildings") return { ...layer, maxzoom: 13 };
      if (layer.type === "background")
        return {
          ...layer,
          paint: { ...layer.paint, "background-color": colors.water },
        };
      if (layer.type !== "fill" && layer.type !== "line") return layer;
      const color =
        layer.id === "earth"
          ? colors.earth
          : layer.id.startsWith("landcover") ||
              layer.id.includes("park") ||
              layer.id.includes("green")
            ? colors.green
            : layer.id.startsWith("water")
              ? colors.water
              : layer.id.startsWith("roads_")
                ? layer.id.includes("casing")
                  ? colors.roadEdge
                  : layer.id.includes("rail")
                    ? colors.rail
                    : colors.road
                : null;
      if (!color) return layer;
      if (layer.type === "line" && /roads_(major|highway)$/.test(layer.id)) {
        return {
          ...layer,
          paint: {
            ...layer.paint,
            "line-color": color,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              1,
              13,
              2.5,
              15,
              4.5,
              17,
              8,
            ],
          },
        };
      }
      return {
        ...layer,
        paint: {
          ...layer.paint,
          [layer.type === "fill" ? "fill-color" : "line-color"]: color,
        },
      };
    },
  );
  const firstLabel = base.findIndex((layer) => layer.type === "symbol");
  return {
    version: 8,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${new URL("/tiles/korea-z15.pmtiles", origin).href}`,
        attribution: "© OpenStreetMap · Protomaps",
      },
      [FESTIVAL_SOURCE]: {
        type: "geojson",
        data: festivalGeoJson(festivals),
        cluster: true,
        clusterRadius: 28,
        clusterMaxZoom: 13,
      },
      "festival-areas": { type: "geojson", data: festivalColumns(festivals) },
      "festival-ring": {
        type: "geojson",
        data: festivalRings(festivals, null),
      },
    },
    glyphs: "/tiles/fonts/{fontstack}/{range}.pbf",
    sprite: `/tiles/sprites/v4/${flavor}`,
    layers: [
      ...base.slice(0, firstLabel),
      {
        id: BUILDING_EXTRUSION,
        type: "fill-extrusion",
        source: "protomaps",
        "source-layer": "buildings",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": colors.building,
          "fill-extrusion-height": [
            "case",
            ["has", "height"],
            ["to-number", ["get", "height"], 10],
            ["has", "building:levels"],
            ["*", ["to-number", ["get", "building:levels"], 1], 3],
            10,
          ],
          "fill-extrusion-base": ["to-number", ["get", "min_height"], 0],
          "fill-extrusion-opacity": 0.82,
        },
      },
      {
        id: "festival-forecast-area",
        type: "fill",
        source: "festival-ring",
        minzoom: 11,
        paint: { "fill-color": colors.focus, "fill-opacity": 0.13 },
      },
      {
        id: FESTIVAL_COLUMNS,
        type: "fill-extrusion",
        source: "festival-areas",
        minzoom: 10,
        paint: {
          "fill-extrusion-color": [
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
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-opacity": 0.92,
        },
      },
      ...base.slice(firstLabel),
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
        id: "festival-labels",
        type: "symbol",
        source: FESTIVAL_SOURCE,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["concat", ["get", "grade"], " ", ["get", "name"]],
          "text-font": ["Noto Sans Medium"],
          "text-size": 12,
          "text-offset": [0, -1.7],
          "text-anchor": "bottom",
          "text-optional": true,
          "text-max-width": 14,
        },
        paint: {
          "text-color": colors.ink,
          "text-halo-color": colors.surface,
          "text-halo-width": 2,
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
