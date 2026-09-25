// 종류가 붙은 건물을 벽(종류별 창문 그림용)·지붕(옥상·박공·옥탑)·간판 형상으로 모아 종류마다 하나로 합친다.
import { type BufferGeometry, Color, ExtrudeGeometry, Shape } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sceneColor } from "../quality";
import {
  BUILDING_KINDS,
  type BuildingKind,
  jitter,
  type StyledBuilding,
} from "./building-kind";
import {
  gableRoof,
  paint,
  rooftopBox,
  signBands,
  slice,
} from "./building-parts";

export type BuildingPalette = {
  walls: Record<BuildingKind, string[]>;
  accents: string[];
  houseRoofs: string[];
  signs: string[];
  roofs: { green: string; grey: string; dark: string; metal: string };
};
export type BuildingGeometry = {
  walls: Partial<Record<BuildingKind, BufferGeometry>>;
  roofs: BufferGeometry | null;
  signs: BufferGeometry | null;
};

// 토큰에서 종류별 색을 읽는다(시험에서는 읽는 함수를 바꿔 끼운다).
export function buildingPalette(
  read: (name: string) => string = sceneColor,
): BuildingPalette {
  const list = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => read(`bldg-${prefix}-${i + 1}`));
  return {
    walls: {
      apartment: list("apartment", 4),
      office: list("office", 4),
      villa: list("villa", 4),
      house: list("house", 4),
      shop: list("shop", 4),
      school: list("school", 2),
      factory: list("factory", 2),
    },
    accents: list("accent", 4),
    houseRoofs: list("house-roof", 4),
    signs: list("sign", 6),
    roofs: {
      green: read("bldg-roof-green"),
      grey: read("bldg-roof-grey"),
      dark: read("bldg-roof-dark"),
      metal: read("bldg-roof-metal"),
    },
  };
}

// 건물마다 정해진 소금값으로 색 목록에서 하나를 고른다.
function pick(colors: string[], building: StyledBuilding, salt: number) {
  return colors[Math.floor(jitter(building, salt) * colors.length)];
}

// 옥상 색: 빌라·상가·학교는 방수 초록(열에 여섯), 공장은 금속, 오피스는 짙은 회색, 나머지는 콘크리트 회색.
function roofTone(building: StyledBuilding, palette: BuildingPalette) {
  const { roofs } = palette;
  if (building.kind === "factory") return roofs.metal;
  if (building.kind === "office") return roofs.dark;
  if (["villa", "shop", "school"].includes(building.kind))
    return jitter(building, 3) < 0.6 ? roofs.green : roofs.grey;
  return roofs.grey;
}

export function cityBuildingGeometry(
  buildings: StyledBuilding[],
  palette: BuildingPalette,
): BuildingGeometry | null {
  const walls = new Map<BuildingKind, BufferGeometry[]>();
  const roofs: BufferGeometry[] = [];
  const signs: BufferGeometry[] = [];
  const color = new Color();
  for (const building of buildings) {
    const outline = building.footprint;
    if (!outline) continue;
    const shape = new Shape();
    outline.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });
    shape.closePath();
    // 높이는 장난감처럼 조금 과장하되 낮은 건물도 4m 이상으로 보이게 한다.
    const height = Math.max(4, building.height * 1.4);
    const top = building.minHeight + height;
    const geometry = new ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, building.minHeight, 0);
    const shade = 0.94 + jitter(building) * 0.1;
    const wall = slice(geometry, 1);
    const flat = slice(geometry, 0);
    geometry.dispose();
    paint(
      wall,
      color
        .set(pick(palette.walls[building.kind], building, 4))
        .multiplyScalar(shade),
    );
    const list = walls.get(building.kind) ?? [];
    list.push(wall);
    walls.set(building.kind, list);
    // 주택은 평지붕 대신 박공지붕, 나머지는 종류별 옥상 색.
    if (building.kind === "house") {
      flat.dispose();
      roofs.push(
        gableRoof(
          building.frame,
          top,
          color
            .set(pick(palette.houseRoofs, building, 5))
            .multiplyScalar(shade),
        ),
      );
    } else
      roofs.push(
        paint(
          flat,
          color.set(roofTone(building, palette)).multiplyScalar(shade),
        ),
      );
    // 큰 아파트·오피스에는 옥탑(아파트는 단지 띠 색), 상가에는 1층 간판.
    if (
      (building.kind === "apartment" || building.kind === "office") &&
      building.frame.length > 12
    )
      roofs.push(
        rooftopBox(
          building.frame,
          top,
          color.set(
            building.kind === "apartment"
              ? pick(palette.accents, building, 6)
              : palette.roofs.dark,
          ),
        ),
      );
    if (building.kind === "shop")
      signs.push(
        ...signBands(outline, building.frame, building.minHeight, (index) =>
          color.set(pick(palette.signs, building, 7 + index)),
        ),
      );
  }
  if (!walls.size) return null;
  const merged: BuildingGeometry = {
    walls: {},
    roofs: roofs.length ? mergeGeometries(roofs, false) : null,
    signs: signs.length ? mergeGeometries(signs, false) : null,
  };
  for (const kind of BUILDING_KINDS) {
    const pieces = walls.get(kind);
    if (pieces) merged.walls[kind] = mergeGeometries(pieces, false);
  }
  for (const piece of [...[...walls.values()].flat(), ...roofs, ...signs])
    piece.dispose();
  return merged;
}

// 형상 묶음 전체를 해제한다.
export function disposeBuildingGeometry(geometry: BuildingGeometry | null) {
  if (!geometry) return;
  for (const part of Object.values(geometry.walls)) part?.dispose();
  geometry.roofs?.dispose();
  geometry.signs?.dispose();
}

// 밤에 창에 불이 켜진 건물은 좌표로 정한 결정적 약 40%다.
export function isLit(building: { x: number; z: number }) {
  return jitter(building) > 0.62;
}
