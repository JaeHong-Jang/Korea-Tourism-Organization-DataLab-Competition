// 실제 건물 외곽선을 크림색 미니어처 건물로 세우고 한 형상으로 합쳐 그린다.
import { useEffect, useMemo } from "react";
import {
  type BufferGeometry,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Shape,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sceneColor } from "../quality";
import type { VenueBuilding } from "../venue/tiles";

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

// 외곽선을 위로 밀어 올리고 윗면·옆면에 서로 다른 크림색을 칠한다.
export type BuildingPalette = { wall: string; roof: string; tall: string };

export function cityBuildingGeometry(
  buildings: VenueBuilding[],
  palette: BuildingPalette,
): BufferGeometry | null {
  const wall = new Color(palette.wall);
  const roof = new Color(palette.roof);
  const tall = new Color(palette.tall);
  const pieces: BufferGeometry[] = [];
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
    const normals = geometry.getAttribute("normal");
    const colors = new Float32Array(normals.count * 3);
    const shade = 0.94 + jitter(building) * 0.1;
    for (let index = 0; index < normals.count; index++) {
      const up = normals.getY(index) > 0.5;
      color.copy(up ? roof : building.height > 40 ? tall : wall);
      color.multiplyScalar(shade);
      colors.set([color.r, color.g, color.b], index * 3);
    }
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    pieces.push(geometry);
  }
  const merged = pieces.length ? mergeGeometries(pieces, false) : null;
  for (const piece of pieces) piece.dispose();
  return merged;
}

// 밤에 창에 불이 켜진 건물은 좌표로 정한 결정적 약 40%다.
export function isLit(building: VenueBuilding) {
  return jitter(building) > 0.62;
}

// 가까운 건물부터 품질 상한까지 세우고, 밤에는 불 켜진 건물을 스스로 빛나는 재질로 따로 그린다.
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
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
    [],
  );
  const litMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        emissive: new Color(sceneColor("city-window")),
        emissiveIntensity: 0.24,
      }),
    [],
  );

  // 자료가 바뀌거나 화면을 떠날 때 합친 형상과 재료를 해제한다.
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => litGeometry?.dispose(), [litGeometry]);
  useEffect(
    () => () => {
      material.dispose();
      litMaterial.dispose();
    },
    [material, litMaterial],
  );

  return (
    <>
      {geometry && (
        <mesh
          geometry={geometry}
          material={material}
          castShadow={quality === "high"}
          receiveShadow={quality === "high"}
        />
      )}
      {litGeometry && (
        <mesh
          geometry={litGeometry}
          material={litMaterial}
          receiveShadow={quality === "high"}
        />
      )}
    </>
  );
}
