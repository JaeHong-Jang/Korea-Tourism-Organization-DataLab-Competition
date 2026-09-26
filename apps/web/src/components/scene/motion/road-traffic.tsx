// 전국 고속도로(바탕 지도의 실제 고속도로, 오기 전에는 도시를 이은 축)에 부품으로 만든 장난감 승용차·택시·버스를 길이에 비례해 흘린다.
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
  Color,
  type InstancedMesh,
  MeshLambertMaterial,
} from "three";
import type { Pose } from "../city/stamp";
import { kindOf, stampCar } from "../city/vehicle-kit";
import type { SceneQuality } from "../quality";
import { sceneColor } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import {
  type MotionPoint,
  type MotionRoute,
  motionSeconds,
  roadRoutes,
  routePosition,
} from "./rail-lines";

// 낮음에서는 그리지 않고 다른 단계는 장면당 최대 수를 고정한다.
export function roadTrafficCap(quality: SceneQuality): number {
  return quality === "high" ? 150 : quality === "medium" ? 80 : 0;
}

// 차를 고속도로축 길이에 비례해 나눈다(축마다 최소 한 대, 남는 대수는 소수점이 큰 축부터) — [축 번호, 축 안 순번, 축의 차 수].
export function trafficSlots(cars: number, routes: MotionRoute[] = roadRoutes) {
  const total = routes.reduce((sum, line) => sum + line.length, 0);
  const exact = routes.map((line) => (cars * line.length) / total);
  const counts = exact.map((value) => Math.max(1, Math.floor(value)));
  const order = exact
    .map((value, line) => ({ rest: value - Math.floor(value), line }))
    .sort((a, b) => b.rest - a.rest);
  let left = cars - counts.reduce((sum, count) => sum + count, 0);
  for (let turn = 0; left > 0; turn++, left--)
    counts[order[turn % order.length].line]++;
  const slots: [number, number, number][] = [];
  const most = Math.max(...counts);
  for (let slot = 0; slot < most; slot++)
    counts.forEach((count, line) => {
      if (slot < count && slots.length < cars) slots.push([line, slot, count]);
    });
  return slots;
}

// 승용차·택시·버스를 동네 3D와 같은 부품(차체·유리·지붕 — 전국 판에서는 바퀴가 점보다 작아 뺀다)으로 그린다 — 연출이며 실제 교통량이 아니다.
const NATIONAL_VEHICLE_SIZE = 0.8;
// 차는 도로선에서 달리는 방향 오른쪽으로 0.9km 비킨 차로로 다닌다(도로선은 바탕 지도가 그린다).
const LANE = 0.9;

export function RoadTraffic({
  quality,
  reducedMotion,
  routes = roadRoutes,
}: {
  quality: SceneQuality;
  reducedMotion: boolean;
  // 차가 다닐 길 — 바탕 지도가 오면 실제 고속도로에서 만든 경로, 오기 전에는 도시를 이은 축.
  routes?: MotionRoute[];
}) {
  const clock = useThree((state) => state.clock);
  const cars = routes.length ? roadTrafficCap(quality) : 0;
  const slots = useMemo(() => trafficSlots(cars, routes), [cars, routes]);
  const refs = {
    body: useRef<InstancedMesh>(null),
    glass: useRef<InstancedMesh>(null),
    roof: useRef<InstancedMesh>(null),
  };
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const pose = useMemo<Pose>(
    () => ({
      x: 0,
      y: LAND_SURFACE_Y + 0.12,
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
  // 축마다 길이에 비례한 대수를 균등하게 벌려 달리되 실제 교통량처럼 해석되지 않게 한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs는 같은 useRef 객체를 가리킨다.
  const place = useCallback(
    (seconds: number) => {
      const parts = {
        body: refs.body.current?.instanceMatrix.array,
        glass: refs.glass.current?.instanceMatrix.array,
        roof: refs.roof.current?.instanceMatrix.array,
      };
      for (let index = 0; index < cars; index++) {
        const [route, slot, count] = slots[index];
        const line = routes[route];
        const bus = kindOf(index) === "bus";
        routePosition(
          line,
          seconds,
          bus ? 1.9 : 2.5,
          (slot / count) * line.length * 2,
          point,
        );
        pose.x = point.x + Math.cos(point.heading) * LANE;
        pose.z = point.z - Math.sin(point.heading) * LANE;
        pose.heading = point.heading;
        stampCar(parts, index, pose, 0);
      }
      for (const ref of Object.values(refs))
        if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    },
    [cars, point, pose, slots, routes],
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
    },
    [box, material],
  );

  if (cars === 0) return null;
  return (
    <group>
      {(["body", "glass", "roof"] as const).map((name) => (
        <instancedMesh
          key={name}
          ref={refs[name]}
          args={[box, material, cars]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
