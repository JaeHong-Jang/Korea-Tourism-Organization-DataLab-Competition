// 주요 도시 사이와 수도권·부산 주변에 부품으로 만든 장난감 승용차·택시·버스를 흘린다.
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
  MeshLambertMaterial,
  Vector3,
} from "three";
import type { Pose } from "../city/stamp";
import { kindOf, stampCar } from "../city/vehicle-kit";
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

// 승용차·택시·버스를 동네 3D와 같은 부품(차체·유리·지붕·바퀴)으로 그린다 — 연출이며 실제 교통량이 아니다.
const NATIONAL_VEHICLE_SIZE = 0.8;

export function RoadTraffic({
  quality,
  reducedMotion,
}: {
  quality: SceneQuality;
  reducedMotion: boolean;
}) {
  const clock = useThree((state) => state.clock);
  const cars = roadTrafficCap(quality);
  const refs = {
    body: useRef<InstancedMesh>(null),
    glass: useRef<InstancedMesh>(null),
    roof: useRef<InstancedMesh>(null),
    wheel: useRef<InstancedMesh>(null),
  };
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const pose = useMemo<Pose>(
    () => ({
      x: 0,
      y: LAND_SURFACE_Y,
      z: 0,
      heading: 0,
      size: NATIONAL_VEHICLE_SIZE,
    }),
    [],
  );
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () => new MeshLambertMaterial({ flatShading: true }),
    [],
  );
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

  // 각 경로의 길이에 맞춰 균등하게 벌려 달리되 실제 교통량처럼 해석되지 않게 한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs는 같은 useRef 객체를 가리킨다.
  const place = useCallback(
    (seconds: number) => {
      const parts = {
        body: refs.body.current?.instanceMatrix.array,
        glass: refs.glass.current?.instanceMatrix.array,
        roof: refs.roof.current?.instanceMatrix.array,
        wheel: refs.wheel.current?.instanceMatrix.array,
      };
      const slots = Math.ceil(cars / roadRoutes.length);
      for (let index = 0; index < cars; index++) {
        const line = roadRoutes[index % roadRoutes.length];
        const slot = Math.floor(index / roadRoutes.length);
        const bus = kindOf(index) === "bus";
        routePosition(
          line,
          seconds,
          bus ? 1.9 : 2.5,
          (slot / slots) * line.length * 2,
          point,
        );
        pose.x = point.x + Math.cos(point.heading) * 5;
        pose.z = point.z - Math.sin(point.heading) * 5;
        pose.heading = point.heading;
        stampCar(parts, index, pose, 1);
      }
      for (const ref of Object.values(refs))
        if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    },
    [cars, point, pose],
  );

  // 차체 색(승용차 7색·택시·버스)과 유리·바퀴 색은 처음 한 번만 칠한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs는 같은 객체를 가리킨다.
  useLayoutEffect(() => {
    const paint = Array.from(
      { length: 7 },
      (_, i) => new Color(sceneColor(`car-${i + 1}`)),
    );
    const taxi = new Color(sceneColor("taxi"));
    const buses = [
      new Color(sceneColor("bus-blue")),
      new Color(sceneColor("bus-green")),
    ];
    const glass = new Color(sceneColor("glass"));
    const tire = new Color(sceneColor("tire"));
    for (let index = 0; index < cars; index++) {
      const kind = kindOf(index);
      const color =
        kind === "taxi"
          ? taxi
          : kind === "bus"
            ? buses[index % 2]
            : paint[index % 7];
      refs.body.current?.setColorAt(index, color);
      refs.roof.current?.setColorAt(index, color);
      refs.glass.current?.setColorAt(index, glass);
      for (let wheel = 0; wheel < 4; wheel++)
        refs.wheel.current?.setColorAt(index * 4 + wheel, tire);
    }
    for (const ref of Object.values(refs))
      if (ref.current?.instanceColor)
        ref.current.instanceColor.needsUpdate = true;
    place(motionSeconds(clock.getElapsedTime(), reducedMotion));
  }, [cars, reducedMotion, place, clock]);
  useFrame((state) => {
    if (cars && !reducedMotion)
      place(motionSeconds(state.clock.elapsedTime, reducedMotion));
  });

  // 품질 교체나 언마운트 때 GPU 자원을 해제한다.
  useEffect(
    () => () => {
      box.dispose();
      material.dispose();
      roadGeometry.dispose();
      roadMaterial.dispose();
    },
    [box, material, roadGeometry, roadMaterial],
  );

  if (cars === 0) return null;
  return (
    <group>
      <primitive object={roads} />
      {(["body", "glass", "roof"] as const).map((name) => (
        <instancedMesh
          key={name}
          ref={refs[name]}
          args={[box, material, cars]}
          frustumCulled={false}
        />
      ))}
      <instancedMesh
        ref={refs.wheel}
        args={[box, material, cars * 4]}
        frustumCulled={false}
      />
    </group>
  );
}
