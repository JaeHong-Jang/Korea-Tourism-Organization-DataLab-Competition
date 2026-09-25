// 행사장에서 가장 가까운 역까지 걷는 귀가 길을 바닥 위 얇은 띠로 표시한다(연출 — 실제 동선 관측 아님).
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { MotionRoute } from "../motion/rail-lines";
import { sceneColor } from "../quality";

// 폭 7m·두께 0.3m 띠를 길 표면(0.9~1.3m) 위에 선분마다 하나씩 깐다.
export function HomewardPath({ route }: { route: MotionRoute }) {
  const mesh = useRef<InstancedMesh>(null);
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: sceneColor("homeward"),
        transparent: true,
        opacity: 0.9,
      }),
    [],
  );
  const count = route.points.length - 1;
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new Matrix4();
    const turn = new Quaternion();
    const up = new Vector3(0, 1, 0);
    for (let index = 0; index < count; index++) {
      const [ax, az] = route.points[index];
      const [bx, bz] = route.points[index + 1];
      const length = Math.hypot(bx - ax, bz - az);
      turn.setFromAxisAngle(up, Math.atan2(bx - ax, bz - az));
      matrix.compose(
        new Vector3((ax + bx) / 2, 1.55, (az + bz) / 2),
        turn,
        new Vector3(7, 0.3, length + 2),
      );
      target.setMatrixAt(index, matrix);
    }
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [route, count]);
  // 형상·재료는 화면을 떠날 때 해제한다.
  useEffect(
    () => () => {
      box.dispose();
      material.dispose();
    },
    [box, material],
  );
  if (count < 1) return null;
  return <instancedMesh key={count} ref={mesh} args={[box, material, count]} />;
}
