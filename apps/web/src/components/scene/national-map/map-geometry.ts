// 성남 지도의 외곽·구멍 보존 방식으로 실제 건물과 지도 면을 병합해 그린다.
import {
  BufferGeometry,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  ShapeGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sceneColor } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import type { MapBuilding, MapPoint, MapRoad, MapTile } from "./types";

export const MAP_COLORS = [
  "land-edge",
  "city-roof",
  "city-water",
  "cover-forest",
  "city-park",
  "city-path",
  "city-rail",
  "city-road",
] as const;
export type MapPalette = Record<(typeof MAP_COLORS)[number], string>;

// 작업 스레드에서는 문서 접근 없이 전달받은 디자인 토큰 색을 사용한다.
function mapColor(name: keyof MapPalette, palette?: MapPalette) {
  return new Color(palette?.[name] ?? sceneColor(name));
}

// 첫 고리는 외곽, 이후 고리는 구멍으로 넣어 건물 중정과 호수 내부 섬을 메우지 않는다.
export function mapShape(rings: MapPoint[][]): Shape {
  const trace = (path: Shape | Path, ring: MapPoint[]) => {
    ring.forEach(([x, z], index) => {
      if (index) path.lineTo(x, -z);
      else path.moveTo(x, -z);
    });
    path.closePath();
  };
  const shape = new Shape();
  trace(shape, rings[0]);
  shape.holes = rings.slice(1).map((ring) => {
    const path = new Path();
    trace(path, ring);
    return path;
  });
  return shape;
}

// 면별 색을 버텍스에 저장하고 병합 후 필요 없는 UV·그룹을 제거한다.
function painted(
  geometry: BufferGeometry,
  color: Color,
  roof?: Color,
): BufferGeometry {
  const target = geometry.index ? geometry.toNonIndexed() : geometry;
  if (target !== geometry) geometry.dispose();
  const colors = new Float32Array(target.getAttribute("position").count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  if (roof)
    for (const group of target.groups)
      if (group.materialIndex === 0)
        for (let i = group.start; i < group.start + group.count; i++) {
          colors[i * 3] = roof.r;
          colors[i * 3 + 1] = roof.g;
          colors[i * 3 + 2] = roof.b;
        }
  target.setAttribute("color", new Float32BufferAttribute(colors, 3));
  target.deleteAttribute("uv");
  target.clearGroups();
  return target;
}

// 실제 건물 높이는 km로 세우며 성남의 중립 벽·밝은 지붕 표현을 같은 색 토큰으로 쓴다.
export function buildingGeometry(
  buildings: MapBuilding[],
  palette?: MapPalette,
): BufferGeometry | null {
  const wall = mapColor("land-edge", palette),
    roof = mapColor("city-roof", palette);
  const pieces: BufferGeometry[] = [];
  for (const building of buildings)
    for (const rings of building.polygons) {
      if (rings[0]?.length < 4) continue;
      const geometry = new ExtrudeGeometry(mapShape(rings), {
        depth: building.height - building.minHeight,
        bevelEnabled: false,
        curveSegments: 1,
        steps: 1,
      });
      const colored = painted(geometry, wall, roof);
      colored.rotateX(-Math.PI / 2);
      colored.translate(0, LAND_SURFACE_Y + 0.003 + building.minHeight, 0);
      pieces.push(colored);
    }
  const merged = pieces.length ? mergeGeometries(pieces, false) : null;
  pieces.forEach((piece) => {
    piece.dispose();
  });
  return merged;
}

// 지도 토지 피복은 종류별 높이를 분리해 같은 면의 깜빡임을 피한다.
export function surfaceGeometry(
  tile: MapTile,
  palette?: MapPalette,
): BufferGeometry | null {
  const pieces: BufferGeometry[] = [];
  const colors = {
    water: mapColor("city-water", palette),
    forest: mapColor("cover-forest", palette),
    urban: mapColor("city-roof", palette),
    park: mapColor("city-park", palette),
  };
  for (const area of tile.areas) {
    const water = area.kind === "water",
      forest = ["forest", "wood"].includes(area.kind);
    const urban = [
      "urban_area",
      "residential",
      "industrial",
      "commercial",
    ].includes(area.kind);
    const color = water
      ? colors.water
      : forest
        ? colors.forest
        : urban
          ? colors.urban
          : colors.park;
    const y = LAND_SURFACE_Y + (water ? 0.002 : forest ? 0.0012 : 0.001);
    for (const rings of area.polygons) {
      if (rings[0]?.length < 4) continue;
      const geometry = painted(new ShapeGeometry(mapShape(rings), 1), color);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, y, 0);
      pieces.push(geometry);
    }
  }
  const merged = pieces.length ? mergeGeometries(pieces, false) : null;
  pieces.forEach((piece) => {
    piece.dispose();
  });
  return merged;
}

// 실제 도로 중심선에 폭을 주고 선분을 한 메시로 합친다.
export function roadGeometry(
  roads: MapRoad[],
  palette?: MapPalette,
): BufferGeometry {
  const positions: number[] = [],
    colors: number[] = [];
  const paletteColors = {
    path: mapColor("city-path", palette),
    rail: mapColor("city-rail", palette),
    road: mapColor("city-road", palette),
  };
  for (const road of roads) {
    const color =
      road.kind === "path"
        ? paletteColors.path
        : road.kind === "rail"
          ? paletteColors.rail
          : paletteColors.road;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1],
        [bx, bz] = road.points[i];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.000001) continue;
      const nx = ((-(bz - az) / length) * road.width) / 2,
        nz = (((bx - ax) / length) * road.width) / 2;
      const y = LAND_SURFACE_Y + 0.003;
      positions.push(
        ax - nx,
        y,
        az - nz,
        bx - nx,
        y,
        bz - nz,
        bx + nx,
        y,
        bz + nz,
        ax - nx,
        y,
        az - nz,
        bx + nx,
        y,
        bz + nz,
        ax + nx,
        y,
        az + nz,
      );
      for (let corner = 0; corner < 6; corner++)
        colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
