// 행사 유형별 조각을 재료색으로 병합하고 등급 깃발을 인스턴싱한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  Euler,
  Matrix4,
  MeshStandardMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sceneColor } from "../quality";
import { LAND_BASE_Y } from "../scene-height";
import { fireworksParts } from "./fireworks-model";
import { flowerParts } from "./flower-model";
import { foodParts } from "./food-model";
import { GradeFlags } from "./grade-flag";
import type { ModelPart } from "./model-part";
import { otherParts } from "./other-model";
import { performanceParts } from "./performance-model";
import type { PlacedFestival } from "./placement";
import { traditionParts } from "./tradition-model";
import { universityParts } from "./university-model";

const models: Record<FestivalSummary["type"], ModelPart[]> = {
  불꽃: fireworksParts,
  공연: performanceParts,
  먹거리: foodParts,
  꽃: flowerParts,
  대학: universityParts,
  전통: traditionParts,
  기타: otherParts,
};

// 계약의 모든 유형에 고유 모형 조각이 있는지 확인할 수 있게 한다.
export function modelForType(type: FestivalSummary["type"]): ModelPart[] {
  return models[type];
}

// 조각을 월드 좌표의 버퍼로 만들어 같은 재료끼리 병합할 수 있게 한다.
function partGeometry(part: ModelPart, x: number, z: number): BufferGeometry {
  const geometry =
    part.kind === "block"
      ? new BoxGeometry(...part.scale)
      : new ConeGeometry(
          part.scale[0],
          part.scale[1],
          Math.round(part.scale[2]),
        );
  if (part.rotation)
    geometry.applyMatrix4(
      new Matrix4().makeRotationFromEuler(new Euler(...part.rotation)),
    );
  geometry.translate(
    x + part.position[0],
    LAND_BASE_Y + part.position[1],
    z + part.position[2],
  );
  return geometry;
}

// 행사 전체의 같은 재료 조각을 한 메시로 묶어 그리기 호출을 줄인다.
function mergedModels(placed: PlacedFestival[]) {
  const byColor = new Map<string, BufferGeometry[]>();
  for (const { festival, x, z } of placed) {
    for (const part of modelForType(festival.type)) {
      const pieces = byColor.get(part.color) ?? [];
      pieces.push(partGeometry(part, x, z));
      byColor.set(part.color, pieces);
    }
  }
  return [...byColor].map(([color, pieces]) => {
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((piece) => {
      piece.dispose();
    });
    if (!geometry) throw new Error(`${color} 모형을 병합할 수 없습니다.`);
    geometry.computeBoundingSphere();
    return {
      color,
      geometry,
      material: new MeshStandardMaterial({
        color: sceneColor(`model-${color}`),
        roughness: 0.9,
      }),
    };
  });
}

// 정적 모형은 색 종류만큼의 메시로 그리고 해제 시 버퍼를 정리한다.
export function FestivalModels({ placed }: { placed: PlacedFestival[] }) {
  const batches = useMemo(() => mergedModels(placed), [placed]);
  useEffect(
    () => () => {
      batches.forEach(({ geometry, material }) => {
        geometry.dispose();
        material.dispose();
      });
    },
    [batches],
  );
  return (
    <group>
      {batches.map(({ color, geometry, material }) => (
        <mesh
          key={color}
          geometry={geometry}
          material={material}
          castShadow
          receiveShadow
        />
      ))}
      <GradeFlags placed={placed} />
    </group>
  );
}
