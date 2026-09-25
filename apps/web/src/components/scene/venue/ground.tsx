// 타일의 도로·선로·물·공원을 낮은 장난감 지면 메시로 묶어 그린다.
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sceneColor } from "../quality";
import type { VenueArea, VenueLine, VenueTiles } from "./tiles";

// 각 도로 선분을 폭을 가진 사각형으로 만들고 한 버퍼에 담는다.
function stripGeometry(lines: VenueLine[], y: number): BufferGeometry {
  const positions: number[] = [];
  for (const { from, to, width } of lines) {
    const dx = to[0] - from[0],
      dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.1) continue;
    const ox = ((-dz / length) * width) / 2,
      oz = ((dx / length) * width) / 2;
    const a = [from[0] + ox, y, from[1] + oz],
      b = [from[0] - ox, y, from[1] - oz];
    const c = [to[0] + ox, y, to[1] + oz],
      d = [to[0] - ox, y, to[1] - oz];
    positions.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

// 작은 다각형들을 같은 재료 한 메시로 합쳐 그리기 호출 수를 제한한다.
function areaGeometry(
  areas: VenueArea[],
  kind: VenueArea["kind"],
): BufferGeometry | null {
  const pieces: BufferGeometry[] = [];
  for (const area of areas) {
    if (area.kind !== kind || area.points.length < 3) continue;
    const shape = new Shape();
    area.points.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });
    shape.closePath();
    const geometry = new ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, kind === "water" ? 0.09 : 0.07, 0);
    pieces.push(geometry);
  }
  const merged = pieces.length ? mergeGeometries(pieces, false) : null;
  pieces.forEach((piece) => {
    piece.dispose();
  });
  return merged;
}

// 지면은 건물과 달리 그림자 계산 없이 색 토큰으로만 재료를 만든다.
export function VenueGround({ tiles }: { tiles: VenueTiles }) {
  const road = useMemo(() => stripGeometry(tiles.roads, 0.14), [tiles]);
  const rail = useMemo(
    () =>
      stripGeometry(
        tiles.rails.map((line) => ({ ...line, width: 3 })),
        0.2,
      ),
    [tiles],
  );
  const water = useMemo(() => areaGeometry(tiles.areas, "water"), [tiles]);
  const park = useMemo(() => areaGeometry(tiles.areas, "park"), [tiles]);
  const materials = useMemo(
    () => ({
      land: new MeshStandardMaterial({
        color: sceneColor("land-1"),
        roughness: 1,
      }),
      road: new MeshStandardMaterial({
        color: sceneColor("model-stage"),
        side: DoubleSide,
        roughness: 1,
      }),
      rail: new MeshStandardMaterial({
        color: sceneColor("model-metal"),
        side: DoubleSide,
        roughness: 1,
      }),
      water: new MeshStandardMaterial({
        color: sceneColor("sea"),
        side: DoubleSide,
        roughness: 0.8,
      }),
      park: new MeshStandardMaterial({
        color: sceneColor("land-2"),
        side: DoubleSide,
        roughness: 1,
      }),
    }),
    [],
  );

  // 타일 자료 교체와 언마운트 때 그 자료의 지면 버퍼를 반환한다.
  useEffect(
    () => () => {
      road.dispose();
      rail.dispose();
      water?.dispose();
      park?.dispose();
    },
    [road, rail, water, park],
  );

  // 장면 언마운트 때 재사용한 색 재료를 한 번만 해제한다.
  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => {
        material.dispose();
      });
    },
    [materials],
  );

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        material={materials.land}
        receiveShadow
      >
        <planeGeometry args={[2500, 2500]} />
      </mesh>
      {park && <mesh geometry={park} material={materials.park} />}
      {water && <mesh geometry={water} material={materials.water} />}
      <mesh geometry={road} material={materials.road} />
      <mesh geometry={rail} material={materials.rail} />
    </group>
  );
}
