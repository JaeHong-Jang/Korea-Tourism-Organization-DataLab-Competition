// 동네 한 조각을 나무 받침 위의 크림색 땅·흰 도로·녹지·물로 깐다.
import { useEffect, useMemo } from "react";
import {
  DoubleSide,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
} from "three";
import { sceneColor } from "../quality";
import { areaGeometry, stripGeometry } from "../venue/ground-geometry";
import type { VenueTiles } from "../venue/tiles";

// 받침 한 변(미터) — 타일을 읽는 반경 1.2km와 맞춘다.
export const CITY_SIZE = 2440;

// 모서리를 둥글린 정사각 받침 윤곽을 만든다.
function roundedSquare(size: number, radius: number): Shape {
  const half = size / 2;
  const shape = new Shape();
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half);
  shape.quadraticCurveTo(half, -half, half, -half + radius);
  shape.lineTo(half, half - radius);
  shape.quadraticCurveTo(half, half, half - radius, half);
  shape.lineTo(-half + radius, half);
  shape.quadraticCurveTo(-half, half, -half, half - radius);
  shape.lineTo(-half, -half + radius);
  shape.quadraticCurveTo(-half, -half, -half + radius, -half);
  return shape;
}

// 길은 큰길을 넓고 밝게, 골목·보행로를 가늘게 두어 성남 지도처럼 읽히게 한다.
export function CityGround({
  tiles,
  wet = false,
}: {
  tiles: VenueTiles;
  wet?: boolean;
}) {
  const base = useMemo(() => {
    const geometry = new ExtrudeGeometry(roundedSquare(CITY_SIZE, 90), {
      depth: 60,
      bevelEnabled: true,
      bevelSize: 8,
      bevelThickness: 8,
      bevelSegments: 2,
      curveSegments: 6,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -68, 0);
    return geometry;
  }, []);
  const minor = useMemo(
    () =>
      stripGeometry(
        tiles.roads
          .filter((line) => line.kind !== "major_road")
          .map((line) => ({ ...line, width: line.kind === "path" ? 3 : 7 })),
        0.9,
      ),
    [tiles],
  );
  const major = useMemo(
    () =>
      stripGeometry(
        tiles.roads
          .filter((line) => line.kind === "major_road")
          .map((line) => ({ ...line, width: 14 })),
        1.1,
      ),
    [tiles],
  );
  const rail = useMemo(
    () =>
      stripGeometry(
        tiles.rails.map((line) => ({ ...line, width: 4 })),
        1.3,
      ),
    [tiles],
  );
  const water = useMemo(() => areaGeometry(tiles.areas, "water"), [tiles]);
  const park = useMemo(() => areaGeometry(tiles.areas, "park"), [tiles]);
  const materials = useMemo(
    () => ({
      top: new MeshStandardMaterial({
        color: sceneColor("city-land"),
        roughness: 1,
      }),
      side: new MeshStandardMaterial({
        color: sceneColor("board-side"),
        roughness: 1,
      }),
      minor: new MeshStandardMaterial({
        color: sceneColor("city-road"),
        side: DoubleSide,
        roughness: wet ? 0.3 : 1,
        metalness: wet ? 0.2 : 0,
      }),
      major: new MeshStandardMaterial({
        color: sceneColor("city-road-major"),
        side: DoubleSide,
        roughness: wet ? 0.25 : 0.95,
        metalness: wet ? 0.25 : 0,
      }),
      rail: new MeshStandardMaterial({
        color: sceneColor("city-rail"),
        side: DoubleSide,
        roughness: 1,
      }),
      water: new MeshStandardMaterial({
        color: sceneColor("city-water"),
        side: DoubleSide,
        roughness: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      park: new MeshStandardMaterial({
        color: sceneColor("city-park"),
        side: DoubleSide,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    }),
    [wet],
  );

  // 자료 교체·언마운트 때 지면 버퍼와 재료를 돌려준다.
  useEffect(
    () => () => {
      for (const geometry of [minor, major, rail, water, park])
        geometry?.dispose();
    },
    [minor, major, rail, water, park],
  );
  useEffect(() => () => base.dispose(), [base]);
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );

  return (
    <group>
      <mesh geometry={base} receiveShadow>
        <primitive object={materials.top} attach="material-0" />
        <primitive object={materials.side} attach="material-1" />
      </mesh>
      {park && <mesh geometry={park} material={materials.park} receiveShadow />}
      {water && <mesh geometry={water} material={materials.water} />}
      <mesh geometry={minor} material={materials.minor} receiveShadow />
      <mesh geometry={major} material={materials.major} receiveShadow />
      <mesh geometry={rail} material={materials.rail} />
    </group>
  );
}
