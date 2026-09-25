// 실제 건물 외곽선을 창문 달린 미니어처 건물로 세우고 벽·지붕을 각각 한 형상으로 합쳐 그린다.
import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Shape,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sceneColor } from "../quality";
import type { VenueBuilding } from "../venue/tiles";
import { windowTexture } from "./window-texture";

// 소프트웨어 렌더러에서도 기준 프레임을 지키도록 품질별 건물 수를 제한한다.
export function cityBuildingCap(quality: "high" | "medium" | "low") {
  return quality === "high" ? 2200 : quality === "medium" ? 1300 : 600;
}

// 같은 건물은 늘 같은 미세 색 차이를 갖도록 좌표로 만든 결정적 값을 쓴다.
function jitter(building: VenueBuilding) {
  const value =
    Math.sin(building.x * 12.9898 + building.z * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

// 외곽선을 위로 밀어 올리고 옆벽(창문 그림을 붙일 면)과 윗면(지붕)을 따로 모은다.
export type BuildingPalette = {
  wall: string;
  roof: string;
  tall: string;
  cool: string;
};
export type BuildingGeometry = { walls: BufferGeometry; roofs: BufferGeometry };

// 돌출 형상의 무리 0은 윗·아랫면, 무리 1은 옆벽 — 정점 범위만 잘라 새 형상으로 만든다.
function slice(geometry: BufferGeometry, materialIndex: number) {
  const group = geometry.groups.find(
    (item) => item.materialIndex === materialIndex,
  );
  const part = new BufferGeometry();
  if (!group) return part;
  for (const name of ["position", "normal", "uv"]) {
    const attribute = geometry.getAttribute(name);
    const size = attribute.itemSize;
    part.setAttribute(
      name,
      new Float32BufferAttribute(
        (attribute.array as Float32Array).slice(
          group.start * size,
          (group.start + group.count) * size,
        ),
        size,
      ),
    );
  }
  return part;
}

// 정점 색을 한 가지로 칠한다(창문 그림·조명과 곱해진다).
function paint(geometry: BufferGeometry, color: Color) {
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++)
    colors.set([color.r, color.g, color.b], index * 3);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

export function cityBuildingGeometry(
  buildings: VenueBuilding[],
  palette: BuildingPalette,
): BuildingGeometry | null {
  const walls: BufferGeometry[] = [];
  const roofs: BufferGeometry[] = [];
  const color = new Color();
  for (const building of buildings) {
    const outline = building.footprint;
    if (!outline || outline.length < 3) continue;
    const shape = new Shape();
    outline.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });
    shape.closePath();
    // 높이는 장난감처럼 조금 과장하되 낮은 건물도 4m 이상으로 보이게 한다.
    const height = Math.max(4, building.height * 1.4);
    const geometry = new ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, building.minHeight, 0);
    // 크림·높은 건물 베이지·옅은 회색(4채 중 1채)을 섞고 좌표로 정한 미세 명암을 준다.
    const tone = jitter(building);
    const shade = 0.94 + tone * 0.1;
    const wall = slice(geometry, 1);
    const roof = slice(geometry, 0);
    geometry.dispose();
    color
      .set(
        tone < 0.25
          ? palette.cool
          : building.height > 40
            ? palette.tall
            : palette.wall,
      )
      .multiplyScalar(shade);
    paint(wall, color);
    color.set(palette.roof).multiplyScalar(shade);
    paint(roof, color);
    walls.push(wall);
    roofs.push(roof);
  }
  if (!walls.length) return null;
  const merged = {
    walls: mergeGeometries(walls, false),
    roofs: mergeGeometries(roofs, false),
  };
  for (const piece of [...walls, ...roofs]) piece.dispose();
  return merged;
}

// 밤에 창에 불이 켜진 건물은 좌표로 정한 결정적 약 40%다.
export function isLit(building: VenueBuilding) {
  return jitter(building) > 0.62;
}

// 가까운 건물부터 품질 상한까지 세우고, 벽에는 창문 그림을, 밤에는 불 켜진 건물의 창만 빛나게 한다.
export function CityBuildings({
  buildings,
  quality,
  night,
}: {
  buildings: VenueBuilding[];
  quality: "high" | "medium" | "low";
  night: boolean;
}) {
  const chosen = useMemo(
    () => buildings.slice(0, cityBuildingCap(quality)),
    [buildings, quality],
  );
  const palette = useMemo(
    () => ({
      wall: sceneColor("city-wall"),
      roof: sceneColor("city-roof"),
      tall: sceneColor("city-wall-tall"),
      cool: sceneColor("city-wall-cool"),
    }),
    [],
  );
  const geometry = useMemo(
    () =>
      cityBuildingGeometry(
        night ? chosen.filter((item) => !isLit(item)) : chosen,
        palette,
      ),
    [chosen, night, palette],
  );
  const litGeometry = useMemo(
    () => (night ? cityBuildingGeometry(chosen.filter(isLit), palette) : null),
    [chosen, night, palette],
  );
  const textures = useMemo(
    () => ({
      glass: windowTexture(sceneColor("glass-window")),
      lit: windowTexture("", true),
    }),
    [],
  );
  const materials = useMemo(
    () => ({
      wall: new MeshStandardMaterial({
        vertexColors: true,
        map: textures.glass,
        roughness: 0.9,
      }),
      litWall: new MeshStandardMaterial({
        vertexColors: true,
        map: textures.glass,
        roughness: 0.9,
        emissive: new Color(sceneColor("city-window")),
        emissiveMap: textures.lit,
        emissiveIntensity: 0.85,
      }),
      roof: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    }),
    [textures],
  );

  // 자료가 바뀌거나 화면을 떠날 때 합친 형상·그림·재료를 해제한다.
  useEffect(
    () => () => {
      geometry?.walls.dispose();
      geometry?.roofs.dispose();
    },
    [geometry],
  );
  useEffect(
    () => () => {
      litGeometry?.walls.dispose();
      litGeometry?.roofs.dispose();
    },
    [litGeometry],
  );
  useEffect(
    () => () => {
      for (const item of Object.values(materials)) item.dispose();
      textures.glass.dispose();
      textures.lit.dispose();
    },
    [materials, textures],
  );

  const shadows = quality === "high";
  return (
    <>
      {geometry && (
        <>
          <mesh
            geometry={geometry.walls}
            material={materials.wall}
            castShadow={shadows}
            receiveShadow={shadows}
          />
          <mesh
            geometry={geometry.roofs}
            material={materials.roof}
            castShadow={shadows}
            receiveShadow={shadows}
          />
        </>
      )}
      {litGeometry && (
        <>
          <mesh
            geometry={litGeometry.walls}
            material={materials.litWall}
            receiveShadow={shadows}
          />
          <mesh
            geometry={litGeometry.roofs}
            material={materials.roof}
            receiveShadow={shadows}
          />
        </>
      )}
    </>
  );
}
