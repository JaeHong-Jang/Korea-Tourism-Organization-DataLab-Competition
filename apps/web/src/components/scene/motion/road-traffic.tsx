// 주요 도시 사이와 수도권·부산 주변에 장난감 차와 버스를 흘린다.
import { useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  type InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from "three";
import type { SceneQuality } from "../quality";
import { sceneColor } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import {
  type MotionPoint,
  motionSeconds,
  roadRoutes,
  routePosition,
} from "./rail-lines";

// 낮음에서는 그리지 않고 다른 단계는 장면당 최대 수를 고정한다.
export function roadTrafficCap(quality: SceneQuality): number {
  return quality === "high" ? 120 : quality === "medium" ? 60 : 0;
}

// 두 크기의 차량을 각각 하나의 인스턴스 메시로 그린다.
export function RoadTraffic({
  quality,
  reducedMotion,
}: {
  quality: SceneQuality;
  reducedMotion: boolean;
}) {
  const clock = useThree((state) => state.clock);
  const cap = roadTrafficCap(quality);
  const buses = Math.floor(cap / 5);
  const cars = cap - buses;
  const carMesh = useRef<InstancedMesh>(null);
  const busMesh = useRef<InstancedMesh>(null);
  const vehicle = useMemo(() => new Object3D(), []);
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const carGeometry = useMemo(() => new BoxGeometry(2.1, 1.3, 3.4), []);
  const busGeometry = useMemo(() => new BoxGeometry(2.7, 2.1, 6.2), []);
  const material = useMemo(() => new MeshBasicMaterial(), []);
  const roadMaterial = useMemo(
    () => new LineBasicMaterial({ color: sceneColor("model-stage") }),
    [],
  );
  const roadGeometry = useMemo(() => {
    const points: Vector3[] = [];
    for (const route of roadRoutes) {
      for (let index = 1; index < route.points.length; index++) {
        const from = route.points[index - 1];
        const to = route.points[index];
        const heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
        const offsetX = Math.cos(heading) * 5;
        const offsetZ = -Math.sin(heading) * 5;
        points.push(
          new Vector3(
            from[0] + offsetX,
            LAND_SURFACE_Y + 0.5,
            from[1] + offsetZ,
          ),
        );
        points.push(
          new Vector3(to[0] + offsetX, LAND_SURFACE_Y + 0.5, to[1] + offsetZ),
        );
      }
    }
    return new BufferGeometry().setFromPoints(points);
  }, []);
  const roads = useMemo(
    () => new LineSegments(roadGeometry, roadMaterial),
    [roadGeometry, roadMaterial],
  );
  const colors = useMemo(
    () =>
      ["--team-analysis", "--team-report", "--team-verification"].map(
        (token) =>
          new Color(
            getComputedStyle(document.documentElement)
              .getPropertyValue(token)
              .trim(),
          ),
      ),
    [],
  );

  // 각 경로의 길이에 맞춰 균등하게 벌려 달리되 실제 교통량처럼 해석되지 않게 한다.
  const place = useCallback(
    (seconds: number) => {
      for (let kind = 0; kind < 2; kind++) {
        const mesh = kind === 0 ? carMesh.current : busMesh.current;
        const count = kind === 0 ? cars : buses;
        if (!mesh) continue;
        for (let index = 0; index < count; index++) {
          const line = roadRoutes[index % roadRoutes.length];
          const slot = Math.floor(index / roadRoutes.length);
          const slots = Math.ceil(count / roadRoutes.length);
          routePosition(
            line,
            seconds,
            kind === 0 ? 2.5 : 1.9,
            (slot / slots) * line.length * 2,
            point,
          );
          vehicle.position.set(
            point.x + Math.cos(point.heading) * 5,
            LAND_SURFACE_Y + (kind === 0 ? 1.3 : 1.7),
            point.z - Math.sin(point.heading) * 5,
          );
          vehicle.rotation.set(0, point.heading, 0);
          vehicle.updateMatrix();
          mesh.setMatrixAt(index, vehicle.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    [cars, buses, vehicle, point],
  );

  // 처음 배치할 때 팀 색을 각 차량에 한 번만 기록한다.
  useLayoutEffect(() => {
    for (let index = 0; index < cars; index++)
      carMesh.current?.setColorAt(index, colors[index % colors.length]);
    for (let index = 0; index < buses; index++)
      busMesh.current?.setColorAt(index, colors[(index + 1) % colors.length]);
    if (carMesh.current?.instanceColor)
      carMesh.current.instanceColor.needsUpdate = true;
    if (busMesh.current?.instanceColor)
      busMesh.current.instanceColor.needsUpdate = true;
    place(motionSeconds(clock.getElapsedTime(), reducedMotion));
  }, [cars, buses, reducedMotion, colors, place, clock]);
  useFrame((state) => {
    if (cap && !reducedMotion)
      place(motionSeconds(state.clock.elapsedTime, reducedMotion));
  });

  // 품질 교체나 언마운트 때 GPU 자원을 해제한다.
  useEffect(
    () => () => {
      carGeometry.dispose();
      busGeometry.dispose();
      material.dispose();
      roadGeometry.dispose();
      roadMaterial.dispose();
    },
    [carGeometry, busGeometry, material, roadGeometry, roadMaterial],
  );

  if (cap === 0) return null;
  return (
    <group>
      <primitive object={roads} />
      <instancedMesh
        ref={carMesh}
        args={[carGeometry, material, cars]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={busMesh}
        args={[busGeometry, material, buses]}
        frustumCulled={false}
      />
    </group>
  );
}
