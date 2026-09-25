// 로컬 타일·한글 라벨과 등급 토큰으로 낮·밤 지도 스타일을 만든다.

import type { FestivalSummary } from "@crowdcast/contracts/types";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";
import { buildingLayers } from "../map-3d/building-style";
import { festivalGeoJson } from "../map-3d/festival-source";

export { festivalGeoJson } from "../map-3d/festival-source";

import { festivalColumns, festivalRings } from "../map-3d/festival-geometry";
import { southKoreanLabelFilter } from "../map-3d/south-korea-area";

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
    buildingRoof: token("--map-building-roof"),
    buildingWindow: token("--map-building-window"),
  };
}

// MapLibre가 PMTiles 프로토콜로 같은 출처의 아카이브만 요청하게 한다.
export function mapStyle(
  theme: "day" | "night",
  festivals: FestivalSummary[],
  colors: Omit<
    ReturnType<typeof mapColors>,
    "buildingRoof" | "buildingWindow"
  > &
    Partial<
      Pick<ReturnType<typeof mapColors>, "buildingRoof" | "buildingWindow">
    > = mapColors(),
  origin = window.location.origin,
): StyleSpecification {
  const flavor = theme === "night" ? "dark" : "light";
  // 베이스맵의 땅·녹지·물·도로를 지도 전용 디자인 토큰으로 맞춘다.
  const base = layers("protomaps", namedFlavor(flavor), { lang: "ko" })
    .filter(
      (layer) =>
        layer.id !== "places_country" &&
        layer.id !== "places_state" &&
        layer.id !== "pois",
    )
    .map((layer) => {
      if (layer.id === "buildings") return { ...layer, maxzoom: 13 };
      // 도시 확대 때 동네 이름만 옅게 남겨 행사와 장소 카드를 먼저 읽게 한다.
      if (layer.type === "symbol" && layer.id === "places_locality")
        return {
          ...layer,
          maxzoom: 13,
          filter: southKoreanLabelFilter(layer.filter),
        };
      if (layer.type === "symbol" && layer.id === "places_subplace")
        return {
          ...layer,
          minzoom: 13,
          filter: southKoreanLabelFilter(layer.filter),
          layout: { ...layer.layout, "text-size": 11 },
          paint: {
            ...layer.paint,
            "text-color": colors.ink,
            "text-opacity": 0.42,
            "text-halo-color": colors.earth,
          },
        };
      if (
        layer.type === "symbol" &&
        layer.layout?.["text-field"] &&
        layer.id !== "address_label"
      )
        return {
          ...layer,
          filter: southKoreanLabelFilter(layer.filter),
          layout: {
            ...layer.layout,
            "text-field": [
              "coalesce",
              ["get", "name:ko"],
              [
                "case",
                ["==", ["get", "script"], "Hangul"],
                ["get", "name"],
                "",
              ],
            ],
          },
        };
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
    }) as StyleSpecification["layers"];
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
      ...buildingLayers(BUILDING_EXTRUSION, theme, colors),
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
