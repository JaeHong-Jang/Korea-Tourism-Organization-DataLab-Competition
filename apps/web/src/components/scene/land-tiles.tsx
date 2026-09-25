// 시군구 폴리곤을 시도별 한 메시로 묶고 삼각형 번호를 행정 코드에 연결한다.

import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Path,
  Shape,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { tileStep } from "../../features/mini-korea/data-mode";
import { type LandAnchor, landAnchor } from "./land-anchor";
import { projectKorea } from "./projection";
import { sceneColor } from "./quality";

type SigunguProperties = { sgg: string; sidonm: string; sggnm: string };
type SigunguFeature = FeatureCollection<
  Polygon | MultiPolygon,
  SigunguProperties
>;
export type FaceRange = { start: number; end: number; code: string };
export type SidoTile = {
  sido: string;
  geometry: BufferGeometry;
  faces: FaceRange[];
};
export type LandModel = {
  tiles: SidoTile[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  centers: Map<string, [number, number]>;
  sidoByCode: Map<string, string>;
  // 가장 큰 땅 조각 안쪽 대표점(도시 건물 무리 자리) — 경계 상자 가운데는 바다일 수 있다.
  anchors: Map<string, LandAnchor>;
};

// 외곽과 구멍의 모든 경계점에 같은 투영을 적용한다.
function ringPath(ring: number[][], path: Shape | Path): void {
  ring.forEach(([longitude, latitude], index) => {
    const [x, z] = projectKorea(longitude, latitude);
    if (index === 0) path.moveTo(x, -z);
    else path.lineTo(x, -z);
  });
  path.closePath();
}

// 하나의 시군구가 여러 섬이나 구멍을 가져도 같은 코드로 묶는다.
function regionGeometry(
  region: SigunguFeature["features"][number],
): BufferGeometry {
  const polygons =
    region.geometry.type === "Polygon"
      ? [region.geometry.coordinates]
      : region.geometry.coordinates;
  const shapes = polygons
    .filter((rings) => rings[0]?.length >= 4)
    .map((rings) => {
      const shape = new Shape();
      ringPath(rings[0], shape);
      for (const hole of rings.slice(1)) {
        const path = new Path();
        ringPath(hole, path);
        shape.holes.push(path);
      }
      return shape;
    });
  return new ExtrudeGeometry(shapes, {
    depth: 2.5,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
}

// 면 인덱스는 시도 메시지 안에서만 유효하므로 범위를 함께 보관한다.
export function codeForFace(
  faces: FaceRange[],
  faceIndex: number,
): string | null {
  return (
    faces.find(({ start, end }) => faceIndex >= start && faceIndex < end)
      ?.code ?? null
  );
}

// 252개 피처를 색상 속성이 있는 17개 시도 메시로 합친다.
export function buildLandModel(topology: Topology): LandModel {
  return buildLandModelForData(topology, null);
}

// 데이터 모드에서는 같은 시군구의 예보 중앙값 합으로 색과 타일 높이를 만든다.
export function buildLandModelForData(
  topology: Topology,
  totals: Map<string, number> | null,
): LandModel {
  const collection = Object.values(topology.objects)[0] as
    | GeometryCollection<SigunguProperties>
    | undefined;
  // 경계 없는 응답은 장면에서 빈 값 안내를 그릴 수 있게 비운 모델로 돌린다.
  if (
    collection?.type !== "GeometryCollection" ||
    collection.geometries.length === 0
  ) {
    return {
      tiles: [],
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
      centers: new Map(),
      sidoByCode: new Map(),
      anchors: new Map(),
    };
  }
  const regions = feature(topology, collection) as SigunguFeature;
  const bySido = new Map<
    string,
    Array<{ code: string; geometry: BufferGeometry }>
  >();
  const centers = new Map<string, [number, number]>();
  const sidoByCode = new Map<string, string>();
  const anchors = new Map<string, LandAnchor>();
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  const palette = Array.from(
    { length: 5 },
    (_, index) => new Color(sceneColor(`land-${index + 1}`)),
  );
  const edgeColor = new Color(sceneColor("land-edge"));
  const maximum = totals ? Math.max(0, ...totals.values()) : 0;

  // 피처별 중심점과 버텍스 색을 기록한 뒤 시도별 병합 목록에 넣는다.
  regions.features.forEach((region, index) => {
    const { sgg: code, sidonm: sido, sggnm } = region.properties;
    const anchor = landAnchor(region.geometry, sggnm);
    if (anchor) anchors.set(code, anchor);
    const geometry = regionGeometry(region);
    const step = tileStep(totals?.get(code) ?? null, maximum);
    if (totals) geometry.scale(1, 1, Math.max(1, step));
    const positions = geometry.getAttribute("position");
    const color =
      totals && step > 0
        ? new Color(
            getComputedStyle(document.documentElement)
              .getPropertyValue(`--seq-${step}`)
              .trim(),
          )
        : palette[index % palette.length];
    const colors = new Float32Array(positions.count * 3);
    // 윗면은 지역색, 옆면은 토큰의 흙 가장자리 색으로 칠한다.
    for (const group of geometry.groups) {
      const faceColor = group.materialIndex === 0 ? color : edgeColor;
      for (
        let vertex = group.start;
        vertex < group.start + group.count;
        vertex++
      ) {
        colors.set([faceColor.r, faceColor.g, faceColor.b], vertex * 3);
      }
    }
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const x = positions.getX(vertex);
      const z = -positions.getY(vertex);
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minZ = Math.min(bounds.minZ, z);
      bounds.maxZ = Math.max(bounds.maxZ, z);
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    const center = geometry.boundingBox;
    if (center)
      centers.set(code, [
        (center.min.x + center.max.x) / 2,
        -(center.min.y + center.max.y) / 2,
      ]);
    sidoByCode.set(code, sido);
    bySido.set(sido, [...(bySido.get(sido) ?? []), { code, geometry }]);
  });

  // 병합한 버텍스 순서가 raycast의 faceIndex 순서와 같도록 범위를 누적한다.
  const tiles = Array.from(bySido, ([sido, entries]) => {
    let cursor = 0;
    const faces = entries.map(({ code, geometry }) => {
      const count =
        (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
      const range = { start: cursor, end: cursor + count, code };
      cursor += count;
      return range;
    });
    const geometry = mergeGeometries(
      entries.map((entry) => entry.geometry),
      false,
    );
    entries.forEach((entry) => {
      entry.geometry.dispose();
    });
    if (!geometry) throw new Error(`${sido} 타일을 병합할 수 없습니다.`);
    return { sido, geometry, faces };
  });
  return { tiles, bounds, centers, sidoByCode, anchors };
}

// 클릭한 삼각형을 시군구 코드로 바꿔 화면의 선택 동작에 넘긴다.
export function LandTiles({
  model,
  onPick,
}: {
  model: LandModel;
  onPick: (code: string) => void;
}) {
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
      }),
    [],
  );

  // 메시가 내려가면 이 컴포넌트가 소유한 공유 재질을 GPU에서 해제한다.
  useEffect(() => () => material.dispose(), [material]);
  return model.tiles.map(({ sido, geometry, faces }) => (
    // biome-ignore lint/a11y/noStaticElementInteractions: Three.js 메시의 포인터 선택은 화면의 행사 목록으로도 접근한다.
    <mesh
      key={sido}
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 7, 0]}
      castShadow
      onClick={(event) => {
        event.stopPropagation();
        const code = codeForFace(faces, event.faceIndex ?? -1);
        if (code) onPick(code);
      }}
    />
  ));
}
