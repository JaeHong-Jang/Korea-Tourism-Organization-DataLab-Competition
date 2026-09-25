// 공원 안과 큰길 가에 줄기·잎 뭉치로 된 나무를 심는다(위치는 연출, 공원·도로는 실제 지도).
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  type InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { sceneColor } from "../quality";
import type { VenueTiles } from "../venue/tiles";
import { buildingIndex, insidePolygon, seededRandom } from "./free-space";

type Tree = { x: number; z: number; size: number; tone: number };

// 품질별 나무 수 상한.
export function treeCap(quality: "high" | "medium" | "low") {
  return quality === "high" ? 1100 : quality === "medium" ? 650 : 260;
}

// 공원은 넓이에 비례해 무작위로, 큰길은 16m 간격 양쪽 보도에 심고 건물 속 자리는 뺀다.
export function plantTrees(tiles: VenueTiles, cap: number): Tree[] {
  const random = seededRandom(20260926);
  const blocked = buildingIndex(tiles.buildings);
  const trees: Tree[] = [];
  const add = (x: number, z: number) => {
    if (Math.hypot(x, z) > 1180 || blocked(x, z, 3)) return;
    trees.push({
      x,
      z,
      size: 0.8 + random() * 0.5,
      tone: Math.floor(random() * 3),
    });
  };
  for (const area of tiles.areas) {
    if (area.kind !== "park" || area.points.length < 3) continue;
    const xs = area.points.map((point) => point[0]);
    const zs = area.points.map((point) => point[1]);
    const [minX, maxX, minZ, maxZ] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...zs),
      Math.max(...zs),
    ];
    const tries = Math.min(
      80,
      Math.ceil(((maxX - minX) * (maxZ - minZ)) / 260),
    );
    for (let i = 0; i < tries && trees.length < cap; i++) {
      const x = minX + random() * (maxX - minX);
      const z = minZ + random() * (maxZ - minZ);
      if (insidePolygon(x, z, area.points)) add(x, z);
    }
  }
  for (const line of tiles.roads) {
    if (line.kind !== "major_road" || trees.length >= cap) continue;
    const dx = line.to[0] - line.from[0];
    const dz = line.to[1] - line.from[1];
    const length = Math.hypot(dx, dz);
    if (length < 8) continue;
    const [nx, nz] = [-dz / length, dx / length];
    for (let at = 8; at < length && trees.length < cap; at += 16)
      for (const side of [-1, 1]) {
        const t = at / length;
        add(
          line.from[0] + dx * t + nx * 10 * side,
          line.from[1] + dz * t + nz * 10 * side,
        );
      }
  }
  return trees.slice(0, cap);
}

// 줄기(육각 기둥)와 잎(다면체)을 인스턴스로 한 번만 배치한다 — 움직이지 않는 장면.
export function CityTrees({
  tiles,
  quality,
}: {
  tiles: VenueTiles;
  quality: "high" | "medium" | "low";
}) {
  const trees = useMemo(
    () => plantTrees(tiles, treeCap(quality)),
    [tiles, quality],
  );
  const trunks = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);
  const trunkGeometry = useMemo(
    () => new CylinderGeometry(0.28, 0.4, 1, 6),
    [],
  );
  const crownGeometry = useMemo(() => new IcosahedronGeometry(1, 0), []);
  const material = useMemo(
    () => new MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
    [],
  );

  // 나무마다 크기·잎 색(세 가지 초록)을 달리해 줄지어 선 가로수도 단조롭지 않게 한다.
  useLayoutEffect(() => {
    const object = new Object3D();
    const trunk = new Color(sceneColor("trunk"));
    const greens = [1, 2, 3].map(
      (index) => new Color(sceneColor(`tree-${index}`)),
    );
    trees.forEach((tree, index) => {
      const k = tree.size * 1.5;
      object.position.set(tree.x, 1.6 * k, tree.z);
      object.rotation.set(0, index * 0.7, 0);
      object.scale.set(k, 3.2 * k, k);
      object.updateMatrix();
      trunks.current?.setMatrixAt(index, object.matrix);
      trunks.current?.setColorAt(index, trunk);
      object.position.set(tree.x, 5.2 * k, tree.z);
      object.scale.set(2.6 * k, 3 * k, 2.6 * k);
      object.updateMatrix();
      crowns.current?.setMatrixAt(index, object.matrix);
      crowns.current?.setColorAt(index, greens[tree.tone]);
    });
    for (const mesh of [trunks.current, crowns.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [trees]);

  // 형상·재료는 화면을 떠날 때 해제한다.
  useEffect(
    () => () => {
      trunkGeometry.dispose();
      crownGeometry.dispose();
      material.dispose();
    },
    [trunkGeometry, crownGeometry, material],
  );

  if (!trees.length) return null;
  return (
    <group key={trees.length}>
      <instancedMesh
        ref={trunks}
        args={[trunkGeometry, material, trees.length]}
      />
      <instancedMesh
        ref={crowns}
        args={[crownGeometry, material, trees.length]}
        castShadow={quality === "high"}
      />
    </group>
  );
}
