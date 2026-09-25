// 동네 길 위를 걷는 사람과 행사장 둘레에 모인 사람을 인형으로 연출한다(실제 사람 위치가 아니다).
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import { dollFarGeometry } from "../crowd/doll-geometry";
import {
  addWalkPhases,
  enableWalking,
  walkingTime,
} from "../crowd/walk-material";
import type { MotionPoint, MotionRoute } from "../motion/rail-lines";
import { sceneColor } from "../quality";
import { vehicleAt } from "../venue/routes";

// 멀리서도 사람으로 읽히게 키운 배율(범례에 "크기는 보이게 키움"으로 밝힌다).
export const PERSON_SCALE = 5;

// 품질별 걷는 사람·모인 사람 수 상한.
export function walkerCaps(quality: "high" | "medium" | "low") {
  return quality === "high"
    ? { walk: 420, gather: 360 }
    : quality === "medium"
      ? { walk: 260, gather: 220 }
      : { walk: 120, gather: 100 };
}

// 걷는 사람은 경로를 따라 움직이고 일부는 행사장(원점) 쪽으로 향한다.
export function CityWalkers({
  routes,
  gather,
  towardShare,
  quality,
  reducedMotion,
}: {
  routes: MotionRoute[];
  gather: number;
  towardShare: number;
  quality: "high" | "medium" | "low";
  reducedMotion: boolean;
}) {
  const caps = walkerCaps(quality);
  const walkCount = routes.length ? caps.walk : 0;
  const gatherCount = Math.min(caps.gather, Math.max(0, Math.round(gather)));
  const total = walkCount + gatherCount;
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const result = dollFarGeometry();
    addWalkPhases(result, Math.max(1, total));
    return result;
  }, [total]);
  const material = useMemo(
    () => enableWalking(new MeshBasicMaterial({ side: DoubleSide })),
    [],
  );
  const object = useMemo(() => new Object3D(), []);
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const colors = useMemo(
    () =>
      Array.from(
        { length: 8 },
        (_, index) => new Color(sceneColor(`person-${index + 1}`)),
      ),
    [],
  );

  // 옷 색과 모인 사람의 자리는 한 번만 기록한다(황금각 나선).
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    for (let index = 0; index < total; index++)
      target.setColorAt(index, colors[index % colors.length]);
    for (let index = 0; index < gatherCount; index++) {
      const angle = index * 2.399963229728653;
      const radius = 40 + Math.sqrt(index) * 9;
      object.position.set(
        Math.cos(angle) * radius,
        0.3,
        Math.sin(angle) * radius,
      );
      object.rotation.set(0, angle + Math.PI, 0);
      object.scale.setScalar(PERSON_SCALE);
      object.updateMatrix();
      target.setMatrixAt(walkCount + index, object.matrix);
    }
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  }, [total, walkCount, gatherCount, colors, object]);

  // 걷는 사람 위치만 프레임마다 바꾸고 객체는 재사용한다.
  useFrame(({ clock }) => {
    const target = mesh.current;
    walkingTime(material, clock.elapsedTime, reducedMotion);
    if (!target || walkCount === 0) return;
    const seconds = reducedMotion ? 0 : clock.elapsedTime * 2;
    for (let index = 0; index < walkCount; index++) {
      const route = routes[index % routes.length];
      vehicleAt(
        route,
        seconds + index * 3.1,
        index,
        index % 100 < towardShare * 100,
        point,
      );
      const side = ((index % 3) - 1) * 2.4;
      object.position.set(
        point.x + Math.cos(point.heading) * side,
        0.3,
        point.z - Math.sin(point.heading) * side,
      );
      object.rotation.set(0, point.heading, 0);
      object.scale.setScalar(PERSON_SCALE);
      object.updateMatrix();
      target.setMatrixAt(index, object.matrix);
    }
    target.instanceMatrix.needsUpdate = true;
  });

  // 형상과 재료는 인원 수가 바뀌거나 화면을 떠날 때 해제한다.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  if (total === 0) return null;
  return (
    <instancedMesh
      key={total}
      ref={mesh}
      args={[geometry, material, total]}
      frustumCulled={false}
    />
  );
}
