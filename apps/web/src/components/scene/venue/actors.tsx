// 행사장 도로·철도 위 장난감 차와 열차를 인스턴싱해 연출한다.
import { useFrame } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BoxGeometry,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
} from "three";
import type { MotionPoint, MotionRoute } from "../motion/rail-lines";
import { routePosition } from "../motion/rail-lines";
import { sceneColor } from "../quality";
import { towardShare, vehicleAt } from "./routes";

// 인스턴스 수는 품질 단계마다 예산 안에서 고정한다.
export function vehicleCap(quality: "high" | "medium" | "low"): number {
  return quality === "high" ? 80 : quality === "medium" ? 40 : 20;
}

// 프레임에서는 객체 한 개와 출력 좌표 한 개만 재사용한다.
export function VenueActors({
  roadRoutes,
  railRoutes,
  quality,
  hour,
  eventHour,
  reducedMotion,
  scale = 1,
}: {
  roadRoutes: MotionRoute[];
  railRoutes: MotionRoute[];
  quality: "high" | "medium" | "low";
  hour: number;
  eventHour: number;
  reducedMotion: boolean;
  // 동네 3D처럼 멀리서 볼 때 차·열차를 보이게 키우는 배율.
  scale?: number;
}) {
  const carCount = roadRoutes.length ? vehicleCap(quality) : 0;
  const trainCount = railRoutes.length
    ? Math.min(railRoutes.length * 3, quality === "low" ? 3 : 12)
    : 0;
  const cars = useRef<InstancedMesh>(null);
  const trains = useRef<InstancedMesh>(null);
  const object = useMemo(() => new Object3D(), []);
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const carBox = useMemo(() => new BoxGeometry(2.5, 1.5, 4), []);
  const trainBox = useMemo(() => new BoxGeometry(3, 2.2, 7), []);
  const carMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: sceneColor("model-banner"),
        roughness: 0.8,
      }),
    [],
  );
  const trainMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: sceneColor("model-roof"),
        roughness: 0.8,
      }),
    [],
  );

  // 슬라이더 시각은 이동 경로 위 결정적 위상이고 모션 감소는 시각에 관계없이 원점에 고정한다.
  const place = useCallback(
    (seconds: number) => {
      for (let index = 0; index < carCount; index++) {
        const route = roadRoutes[index % roadRoutes.length];
        const toward =
          !reducedMotion && index / carCount < towardShare(hour, eventHour);
        vehicleAt(route, seconds, index, toward, point);
        object.position.set(point.x, 1.1 * scale, point.z);
        object.rotation.set(0, point.heading, 0);
        object.scale.setScalar(scale);
        object.updateMatrix();
        cars.current?.setMatrixAt(index, object.matrix);
      }
      for (let index = 0; index < trainCount; index++) {
        const route = railRoutes[index % railRoutes.length];
        routePosition(route, seconds, 3, index * 81, point);
        object.position.set(point.x, 1.7 * scale, point.z);
        object.rotation.set(0, point.heading, 0);
        object.scale.setScalar(scale);
        object.updateMatrix();
        trains.current?.setMatrixAt(index, object.matrix);
      }
      if (cars.current) cars.current.instanceMatrix.needsUpdate = true;
      if (trains.current) trains.current.instanceMatrix.needsUpdate = true;
    },
    [
      carCount,
      trainCount,
      roadRoutes,
      railRoutes,
      hour,
      eventHour,
      reducedMotion,
      object,
      point,
      scale,
    ],
  );

  // 첫 프레임 전에 차를 배치하고 슬라이더 또는 접근성 변경 직후 갱신한다.
  useLayoutEffect(() => {
    place(reducedMotion ? 0 : hour * 3600);
  }, [hour, reducedMotion, place]);
  useFrame(({ clock }) => {
    if (!reducedMotion) place(hour * 3600 + clock.elapsedTime);
  });

  // 진단은 첫 차량 행렬만 읽어 모션 감소 설정의 정지 상태를 확인한다.
  useEffect(() => {
    window.__crowdcastVenueVehicle = () => {
      const matrix = new Matrix4();
      cars.current?.getMatrixAt(0, matrix);
      return Array.from(matrix.elements);
    };
    return () => {
      delete window.__crowdcastVenueVehicle;
    };
  }, []);

  // 품질 교체와 언마운트 때 차량 형상·재료를 해제한다.
  useEffect(
    () => () => {
      carBox.dispose();
      trainBox.dispose();
      carMaterial.dispose();
      trainMaterial.dispose();
    },
    [carBox, trainBox, carMaterial, trainMaterial],
  );

  return (
    <group>
      <instancedMesh
        ref={cars}
        args={[carBox, carMaterial, carCount]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={trains}
        args={[trainBox, trainMaterial, trainCount]}
        frustumCulled={false}
      />
    </group>
  );
}
