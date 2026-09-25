// 건물 돌출의 크림 지붕·어두운 옆면과 야간 창빛 레이어를 조립한다.
import type { StyleSpecification } from "maplibre-gl";

// 낮·밤 모두 같은 OSM 건물 높이를 쓰고 색만 지도 토큰에서 읽는다.
export function buildingLayers(
  id: string,
  theme: "day" | "night",
  colors: { building: string; buildingRoof?: string; buildingWindow?: string },
): StyleSpecification["layers"] {
  const extrusion: StyleSpecification["layers"][number] = {
    id,
    type: "fill-extrusion",
    source: "protomaps",
    "source-layer": "buildings",
    minzoom: 13,
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["zoom"],
        13,
        colors.building,
        15,
        colors.buildingRoof ?? colors.building,
      ],
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
      "fill-extrusion-vertical-gradient": true,
    },
  };
  if (theme === "day") return [extrusion];
  return [
    extrusion,
    {
      id: "building-lit-windows",
      type: "symbol",
      source: "protomaps",
      "source-layer": "buildings",
      minzoom: 14,
      filter: ["==", ["get", "kind"], "building"],
      layout: {
        "text-field": "▪ ▪",
        "text-font": ["Noto Sans Medium"],
        "text-size": 8,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color":
          colors.buildingWindow ?? colors.buildingRoof ?? colors.building,
        "text-opacity": 0.7,
      },
    },
  ];
}
