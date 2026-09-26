// 경로를 땅 위 납작한 띠(도로·강·철로 바닥)로 깔고, 원하면 가운데 흰 점선을 얹는다(선분마다 상자 하나, 인스턴스 한 묶음).
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  type InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from "three";
import { FAR_HEIGHT } from "../city-clusters";
import { sceneColor } from "../quality";
import type { MotionRoute } from "./rail-lines";

type Dash = { length: number; gap: number; width: number; color: string };

// 선분마다(점선은 간격마다) 위치·방향·크기 행렬을 만든다.
export function ribbonMatrices(
  routes: MotionRoute[],
  width: number,
  y: number,
  thickness: number,
  dash?: Dash,
): Matrix4[] {
  const matrices: Matrix4[] = [];
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (const route of routes)
    for (let index = 1; index < route.points.length; index++) {
      const [ax, az] = route.points[index - 1];
      const [bx, bz] = route.points[index];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.01) continue;
      turn.setFromAxisAngle(up, Math.atan2(bx - ax, bz - az));
      if (!dash) {
        matrices.push(
          new Matrix4().compose(
            new Vector3((ax + bx) / 2, y, (az + bz) / 2),
            turn,
            new Vector3(width, thickness, length + width * 0.6),
          ),
        );
        continue;
      }
      for (
        let at = dash.gap / 2;
        at + dash.length < length;
        at += dash.length + dash.gap
      ) {
        const share = (at + dash.length / 2) / length;
        matrices.push(
          new Matrix4().compose(
            new Vector3(ax + (bx - ax) * share, y, az + (bz - az) * share),
            turn,
            new Vector3(dash.width, thickness, dash.length),
          ),
        );
      }
    }
  return matrices;
}

// 한 가지 색의 띠 묶음 — 모양이 바뀌지 않으므로 행렬은 한 번만 적는다.
function Strip({
  matrices,
  color,
  nearOnly = false,
}: {
  matrices: Matrix4[];
  color: string;
  // 멀리서(카메라 높이 320 위)는 점보다 작아 그리지 않는다(흰 점선).
  nearOnly?: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const hidden = useRef<boolean | null>(null);
  useFrame(({ camera }) => {
    const target = mesh.current;
    if (!nearOnly || !target) return;
    const far = camera.position.y > FAR_HEIGHT;
    if (far === hidden.current) return;
    hidden.current = far;
    target.visible = !far;
  });
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () => new MeshLambertMaterial({ color: sceneColor(color) }),
    [color],
  );
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    matrices.forEach((matrix, index) => {
      target.setMatrixAt(index, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [matrices]);
  useEffect(
    () => () => {
      box.dispose();
      material.dispose();
    },
    [box, material],
  );
  if (!matrices.length) return null;
  return (
    <instancedMesh
      key={matrices.length}
      ref={mesh}
      args={[box, material, matrices.length]}
    />
  );
}

export function Ribbons({
  routes,
  width,
  y,
  color,
  dash,
  nearOnly = false,
}: {
  routes: MotionRoute[];
  width: number;
  y: number;
  color: string;
  dash?: Dash;
  // 멀리서는 띠 자체도 그리지 않는다(철로 바닥처럼 멀리선 잘 안 보이는 띠).
  nearOnly?: boolean;
}) {
  const base = useMemo(
    () => ribbonMatrices(routes, width, y, 0.12),
    [routes, width, y],
  );
  const dashes = useMemo(
    () => (dash ? ribbonMatrices(routes, width, y + 0.04, 0.12, dash) : []),
    [routes, width, y, dash],
  );
  return (
    <>
      <Strip matrices={base} color={color} nearOnly={nearOnly} />
      {dash && <Strip matrices={dashes} color={dash.color} nearOnly />}
    </>
  );
}
