// 실제 건물 외곽선을 아파트·오피스·빌라·주택·상가·학교·공장 미니어처로 세우고 종류마다 벽 한 형상으로 합쳐 그린다.
import { useEffect, useMemo } from "react";
import { Color, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { sceneColor } from "../quality";
import type { VenueBuilding, VenueLine, VenueZone } from "../venue/tiles";
import {
  type BuildingGeometry,
  buildingPalette,
  cityBuildingGeometry,
  disposeBuildingGeometry,
  isLit,
} from "./building-geometry";
import {
  BUILDING_KINDS,
  type BuildingKind,
  styleBuildings,
} from "./building-kind";
import { windowTexture } from "./window-texture";

// 소프트웨어 렌더러에서도 기준 프레임을 지키도록 품질별 건물 수를 제한한다.
export function cityBuildingCap(quality: "high" | "medium" | "low") {
  return quality === "high" ? 2200 : quality === "medium" ? 1300 : 600;
}

// 가까운 건물부터 품질 상한까지 세우고, 벽에는 종류별 창문 그림을, 밤에는 불 켜진 건물의 창만 빛나게 한다.
export function CityBuildings({
  buildings,
  zones,
  roads,
  quality,
  night,
}: {
  buildings: VenueBuilding[];
  zones: VenueZone[];
  roads: VenueLine[];
  quality: "high" | "medium" | "low";
  night: boolean;
}) {
  const chosen = useMemo(
    () =>
      styleBuildings(
        buildings.slice(0, cityBuildingCap(quality)),
        zones,
        roads,
      ),
    [buildings, zones, roads, quality],
  );
  const palette = useMemo(() => buildingPalette(), []);
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
  // 종류마다 낮 창문 그림·밤 불빛 그림과 벽 재료 두 벌(꺼진 창·켜진 창)을 만든다.
  const materials = useMemo(() => {
    const window = sceneColor("glass-window");
    const glass = sceneColor("bldg-office-glass");
    const emissive = new Color(sceneColor("city-window"));
    const walls = {} as Record<
      BuildingKind,
      { wall: MeshStandardMaterial; lit: MeshStandardMaterial }
    >;
    for (const kind of BUILDING_KINDS) {
      const map = windowTexture(kind, kind === "office" ? glass : window);
      walls[kind] = {
        wall: new MeshStandardMaterial({
          vertexColors: true,
          map,
          roughness: kind === "office" ? 0.45 : 0.9,
          metalness: kind === "office" ? 0.15 : 0,
        }),
        lit: new MeshStandardMaterial({
          vertexColors: true,
          map,
          roughness: 0.9,
          emissive,
          emissiveMap: windowTexture(kind, "", true),
          emissiveIntensity: 0.85,
        }),
      };
    }
    return {
      walls,
      roof: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      sign: new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
      // 밤 간판은 조명과 관계없이 제 색으로 빛나 보이게 한다.
      signNight: new MeshBasicMaterial({ vertexColors: true }),
    };
  }, []);

  // 자료가 바뀌거나 화면을 떠날 때 합친 형상·그림·재료를 해제한다.
  useEffect(() => () => disposeBuildingGeometry(geometry), [geometry]);
  useEffect(() => () => disposeBuildingGeometry(litGeometry), [litGeometry]);
  useEffect(
    () => () => {
      for (const { wall, lit } of Object.values(materials.walls)) {
        wall.map?.dispose();
        lit.emissiveMap?.dispose();
        wall.dispose();
        lit.dispose();
      }
      materials.roof.dispose();
      materials.sign.dispose();
      materials.signNight.dispose();
    },
    [materials],
  );

  const shadows = quality === "high";
  // 한 묶음(꺼진 창 또는 켜진 창 건물)의 종류별 벽·지붕·간판을 그린다.
  const draw = (part: BuildingGeometry | null, lit: boolean) =>
    part && (
      <>
        {BUILDING_KINDS.map((kind) => {
          const wall = part.walls[kind];
          return (
            wall && (
              <mesh
                key={kind}
                geometry={wall}
                material={materials.walls[kind][lit ? "lit" : "wall"]}
                castShadow={shadows && !lit}
                receiveShadow={shadows}
              />
            )
          );
        })}
        {part.roofs && (
          <mesh
            geometry={part.roofs}
            material={materials.roof}
            castShadow={shadows && !lit}
            receiveShadow={shadows}
          />
        )}
        {part.signs && (
          <mesh
            geometry={part.signs}
            material={night ? materials.signNight : materials.sign}
          />
        )}
      </>
    );
  return (
    <>
      {draw(geometry, false)}
      {draw(litGeometry, true)}
    </>
  );
}
