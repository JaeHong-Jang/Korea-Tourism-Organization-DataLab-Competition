// 경로 위를 왕복하는 부품 조립 모형(배·비행기·동네 사람)을 부품마다 인스턴스 하나로 그린다(연출 — 실제 운항 위치 아님).
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  type InstancedMesh,
  MeshLambertMaterial,
} from "three";
import type { Pose } from "../city/stamp";
import { stamp } from "../city/stamp";
import { FAR_HEIGHT } from "../city-clusters";
import { sceneColor } from "../quality";
import {
  type MotionPoint,
  type MotionRoute,
  motionSeconds,
  routePosition,
} from "./rail-lines";

// 부품 하나 = 색 토큰(여러 개면 모형마다 돌려 칠함)·모형 기준점에서의 위치·크기(모형 단위, 앞 = +z).
export type MoverPart = {
  color: string | string[];
  offset: [number, number, number];
  scale: [number, number, number];
};

// 왕복 경로에서 지금 몇 %를 지났는지(0 출발 ~ 1 도착) — 비행기 고도 곡선에 쓴다.
function progress(
  route: MotionRoute,
  seconds: number,
  speed: number,
  offset: number,
) {
  const period = route.length * 2;
  const distance = (((seconds * speed + offset) % period) + period) % period;
  return (
    (distance > route.length ? period - distance : distance) / route.length
  );
}

export function PartMovers({
  routes,
  perRoute,
  parts,
  size,
  speed,
  height,
  reducedMotion,
  nearOnly = false,
}: {
  routes: MotionRoute[];
  perRoute: number;
  parts: MoverPart[];
  size: number;
  speed: number;
  // 지난 비율(0~1)에 따른 기준 높이(장면 y).
  height: (share: number) => number;
  reducedMotion: boolean;
  // 멀리서는 점보다 작은 모형(동네 사람)을 그리지도 옮기지도 않는다.
  nearOnly?: boolean;
}) {
  const clock = useThree((state) => state.clock);
  const count = routes.length * perRoute;
  const meshes = useRef<(InstancedMesh | null)[]>([]);
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const materials = useMemo(
    () =>
      parts.map((part) =>
        typeof part.color === "string"
          ? new MeshLambertMaterial({ color: sceneColor(part.color) })
          : new MeshLambertMaterial(),
      ),
    [parts],
  );
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const pose = useMemo<Pose>(
    () => ({ x: 0, y: 0, z: 0, heading: 0, size }),
    [size],
  );

  // 경로마다 perRoute대를 왕복 주기에 고르게 벌리고 부품 행렬을 적는다.
  const place = (seconds: number) => {
    let index = 0;
    for (let line = 0; line < routes.length; line++) {
      const route = routes[line];
      for (let slot = 0; slot < perRoute; slot++, index++) {
        const offset = (slot / perRoute) * route.length * 2 + line * 53;
        routePosition(route, seconds, speed, offset, point);
        pose.x = point.x;
        pose.z = point.z;
        pose.y = height(progress(route, seconds, speed, offset));
        pose.heading = point.heading;
        parts.forEach((part, which) => {
          const mesh = meshes.current[which];
          if (mesh)
            stamp(
              mesh.instanceMatrix.array,
              index,
              pose,
              part.offset,
              part.scale,
            );
        });
      }
    }
    for (const mesh of meshes.current)
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
  };

  // 첫 프레임 전에 배치하고(색 목록 부품은 모형마다 돌려 칠함), 움직임 줄이기면 그 자리에 멈춘다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: place는 같은 ref·자세 객체만 쓴다.
  useLayoutEffect(() => {
    parts.forEach((part, which) => {
      const mesh = meshes.current[which];
      if (!mesh || typeof part.color === "string") return;
      const colors = part.color.map((token) => new Color(sceneColor(token)));
      for (let index = 0; index < count; index++)
        mesh.setColorAt(index, colors[(index * 7 + which * 3) % colors.length]);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    place(motionSeconds(clock.getElapsedTime(), reducedMotion));
  }, [count, reducedMotion, clock, parts]);
  const hidden = useRef(false);
  useFrame((state) => {
    const far = nearOnly && state.camera.position.y > FAR_HEIGHT;
    if (far !== hidden.current) {
      hidden.current = far;
      for (const mesh of meshes.current) if (mesh) mesh.count = far ? 0 : count;
      if (!far) place(motionSeconds(state.clock.elapsedTime, reducedMotion));
    }
    if (count && !far && !reducedMotion) place(state.clock.elapsedTime);
  });

  // 형상·재료는 화면을 떠날 때 해제한다.
  useEffect(
    () => () => {
      box.dispose();
      for (const material of materials) material.dispose();
    },
    [box, materials],
  );

  if (!count) return null;
  return (
    <group>
      {materials.map((material, which) => (
        <instancedMesh
          // biome-ignore lint/suspicious/noArrayIndexKey: 부품 순서는 고정이다.
          key={which}
          ref={(mesh) => {
            meshes.current[which] = mesh;
          }}
          args={[box, material, count]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
