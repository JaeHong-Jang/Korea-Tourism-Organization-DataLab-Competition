// 비와 눈을 카메라 절두체와 판 경계가 겹치는 곳에만 그린다.
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  Frustum,
  IcosahedronGeometry,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from "three";
import { sceneColor } from "../quality";

// 결정적 분포를 판 안쪽으로 제한한다.
export function precipitationPoint(
  index: number,
  width: number,
  depth: number,
): [number, number] {
  const x = (((index * 0.754877666) % 1) - 0.5) * Math.max(0, width - 4);
  const z = (((index * 0.569840291) % 1) - 0.5) * Math.max(0, depth - 4);
  return [x, z];
}

// 결정적 위치를 재사용해 매 프레임에는 행렬 값만 고친다.
export function Precipitation({
  kind,
  count,
  reducedMotion,
  center,
  width,
  depth,
  surfaceY,
  night,
}: {
  kind: "rain" | "snow";
  count: number;
  reducedMotion: boolean;
  center: [number, number];
  width: number;
  depth: number;
  surfaceY: number;
  night: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const object = useMemo(() => new Object3D(), []);
  const projection = useMemo(() => new Matrix4(), []);
  const frustum = useMemo(() => new Frustum(), []);
  const point = useMemo(() => new Vector3(), []);
  const positions = useMemo(
    () =>
      Array.from({ length: count }, (_, index) =>
        precipitationPoint(index, width, depth),
      ),
    [count, width, depth],
  );
  const geometry = useMemo(
    () =>
      kind === "rain"
        ? new BoxGeometry(0.09, 1.4, 0.09)
        : new IcosahedronGeometry(0.38, 0),
    [kind],
  );
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: sceneColor(night ? "window-glow" : "model-canvas"),
        transparent: true,
        opacity: kind === "rain" ? (night ? 0.38 : 0.48) : 0.72,
        blending: night ? AdditiveBlending : undefined,
        depthWrite: false,
      }),
    [kind, night],
  );

  // 비·눈의 높이 위상만 움직이고 판과 시야의 교집합 밖은 숨긴다.
  useFrame(({ camera, clock }) => {
    if (!mesh.current) return;
    projection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projection);
    const time = reducedMotion ? 0 : clock.elapsedTime;
    for (let index = 0; index < count; index++) {
      const [x, z] = positions[index];
      const phase = (index * 0.61803398875) % 1;
      const fall =
        (((phase - time * (kind === "rain" ? 0.36 : 0.08)) % 1) + 1) % 1;
      point.set(center[0] + x, surfaceY + 2 + fall * 24, center[1] + z);
      object.position.copy(point);
      object.scale.setScalar(frustum.containsPoint(point) ? 1 : 0);
      object.updateMatrix();
      mesh.current.setMatrixAt(index, object.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  // 첫 프레임과 언마운트 때 인스턴스 버퍼와 재료를 안전하게 관리한다.
  useLayoutEffect(() => {
    if (mesh.current) mesh.current.frustumCulled = false;
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <instancedMesh ref={mesh} args={[geometry, material, count]} />;
}
