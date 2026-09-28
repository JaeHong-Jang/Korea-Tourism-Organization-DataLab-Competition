// OSM 벡터 타일의 실제 건물 외곽·구멍과 도로·녹지·수면을 전국 좌표로 변환한다.
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { projectKorea } from "../projection";
import { ownedLines, ownedPolygons } from "./tile-geometry";
import type { MapTile } from "./types";

// 등록 높이·최소 높이를 우선하고 없는 건물은 성남 지도와 같은 9m 기본 높이를 쓴다.
export function mapBuildingHeight(tags: Record<string, unknown>): {
  height: number;
  minHeight: number;
  estimated: boolean;
} {
  const read = (value: unknown) =>
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  const recorded = read(tags.height ?? tags.render_height);
  const levels = read(tags["building:levels"] ?? tags.levels);
  const value = Math.max(
    1,
    Math.min(600, recorded > 0 ? recorded : levels > 0 ? levels * 3 : 9),
  );
  const base = read(tags.min_height ?? tags.render_min_height);
  return {
    height: value / 1000,
    minHeight: Number.isFinite(base)
      ? Math.max(0, Math.min(value - 1, base)) / 1000
      : 0,
    estimated: !(recorded > 0),
  };
}

// 실제 도로 분류를 폭의 추정 기준으로 쓰며 터널과 지하 구간은 지상에서 숨긴다.
export function mapRoadWidth(kind: string, zoom: number): number {
  const metres =
    kind === "highway"
      ? 18
      : kind === "major_road"
        ? 12
        : kind === "minor_road"
          ? 7
          : kind === "rail"
            ? 4
            : 2.5;
  return Math.max(metres / 1000, zoom < 13 ? (16 - zoom) * 0.012 : 0);
}

// 형상 종류와 실제 태그만으로 표시 내용을 정하고 임의 건물을 생성하지 않는다.
export function readMapTile(
  bytes: ArrayBuffer,
  x: number,
  y: number,
  zoom: number,
): MapTile {
  const layers = new VectorTile(new Pbf(bytes)).layers;
  const tile: MapTile = { areas: [], roads: [], buildings: [], places: [] };
  for (const name of [
    "landcover",
    "landuse",
    "water",
    "roads",
    "buildings",
    "pois",
    "places",
  ]) {
    const layer = layers[name];
    if (!layer) continue;
    for (let index = 0; index < layer.length; index++) {
      const item = layer.feature(index),
        tags = item.properties;
      const geo = item.toGeoJSON(x, y, zoom).geometry;
      const kind = String(tags.kind ?? "");
      if (
        name === "buildings" &&
        zoom >= 13 &&
        item.type === 3 &&
        tags.kind !== "address"
      ) {
        const footprints = ownedPolygons(geo, x, y, zoom);
        if (footprints.length)
          tile.buildings.push({
            id: `${zoom}/${x}/${y}/${item.id ?? index}`,
            polygons: footprints,
            ...mapBuildingHeight(tags),
          });
      } else if (
        name === "roads" &&
        item.type === 2 &&
        ![true, 1, "1", "yes", "true"].includes(tags.is_tunnel)
      ) {
        for (const points of ownedLines(geo, x, y, zoom))
          tile.roads.push({
            kind,
            name: String(tags.name ?? ""),
            width: mapRoadWidth(kind, zoom),
            points,
          });
      } else if (
        ["landcover", "landuse", "water"].includes(name) &&
        item.type === 3
      ) {
        const category = name === "water" ? "water" : kind;
        if (
          [
            "water",
            "forest",
            "wood",
            "grass",
            "grassland",
            "scrub",
            "park",
            "garden",
            "farmland",
            "urban_area",
            "residential",
            "industrial",
            "commercial",
          ].includes(category)
        )
          tile.areas.push({
            kind: category,
            polygons: ownedPolygons(geo, x, y, zoom),
          });
      } else if (
        ["pois", "places"].includes(name) &&
        geo.type === "Point" &&
        tags.name
      ) {
        tile.places.push({
          kind,
          name: String(tags["name:ko"] ?? tags.name),
          point: projectKorea(geo.coordinates[0], geo.coordinates[1]),
        });
      }
    }
  }
  return tile;
}
