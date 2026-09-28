// 성남 지도처럼 실제 도로 위에 예보 비례 인형과 연출 차량을 인스턴싱한다.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  DoubleSide,
  type InstancedMesh,
  MeshLambertMaterial,
  Object3D,
} from "three";
import { dollBodyGeometry, dollHeadGeometry } from "../crowd/doll-geometry";
import { sceneColor } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import type { MapPoint, MapRoad } from "./types";

type Segment = {
  a: MapPoint;
  b: MapPoint;
  length: number;
  width: number;
  distance: number;
};

// 행사 주변 실제 지상 도로의 선분만 사용하고 보행자·차량 경로를 나눈다.
export function streetSegments(
  roads: MapRoad[],
  center: MapPoint,
  vehicle: boolean,
): Segment[] {
  const segments: Segment[] = [];
  for (const road of roads) {
    if (
      !(
        vehicle
          ? ["minor_road", "major_road", "highway"]
          : ["path", "minor_road"]
      ).includes(road.kind)
    )
      continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const distance = Math.hypot(
        (a[0] + b[0]) / 2 - center[0],
        (a[1] + b[1]) / 2 - center[1],
      );
      if (length > 0.012 && distance < 1)
        segments.push({ a, b, length, width: road.width, distance });
    }
  }
  return segments.sort((a, b) => a.distance - b.distance).slice(0, 80);
}

// 프레임마다 행렬 하나만 재사용하고 모션 줄이기에서는 첫 배치 이후 움직이지 않는다.
export function MapStreetLife({
  roads,
  center,
  count,
  reducedMotion,
}: {
  roads: MapRoad[];
  center: MapPoint;
  count: number;
  reducedMotion: boolean;
}) {
  const bodies = useRef<InstancedMesh>(null),
    heads = useRef<InstancedMesh>(null),
    cars = useRef<InstancedMesh>(null);
  const initialized = useRef(false);
  const people = useMemo(
    () => streetSegments(roads, center, false),
    [roads, center],
  );
  const traffic = useMemo(
    () => streetSegments(roads, center, true),
    [roads, center],
  );
  const peopleCount = people.length ? count : 0,
    carCount = Math.min(traffic.length, 36);
  const dummy = useMemo(() => new Object3D(), []);
  const resources = useMemo(
    () => ({
      body: dollBodyGeometry().scale(0.0045, 0.0045, 0.0045),
      head: dollHeadGeometry().scale(0.0045, 0.0045, 0.0045),
      car: new BoxGeometry(0.004, 0.003, 0.01),
      bodyMaterial: new MeshLambertMaterial({ side: DoubleSide }),
      headMaterial: new MeshLambertMaterial({
        color: sceneColor("doll-head"),
        side: DoubleSide,
      }),
      carMaterial: new MeshLambertMaterial(),
      colors: Array.from(
        { length: 8 },
        (_, index) => new Color(sceneColor(`person-${index + 1}`)),
      ),
    }),
    [],
  );

  // 캔버스는 필요할 때만 그리므로, 걷는 인형이 화면에 있을 때만 초당 24번 다시 그리게 요청한다.
  const invalidate = useThree((state) => state.invalidate);
  const animated = !reducedMotion && peopleCount + carCount > 0;
  useEffect(() => {
    if (!animated) return;
    const timer = window.setInterval(() => invalidate(), 1000 / 24);
    return () => window.clearInterval(timer);
  }, [animated, invalidate]);

  // 행사의 예보 축척은 그대로 쓰고 차량 수는 별개의 지도 연출로 제한한다.
  useLayoutEffect(() => {
    initialized.current = people.length === 0 && traffic.length === 0;
    for (let i = 0; i < peopleCount; i++)
      bodies.current?.setColorAt(i, resources.colors[i % 8]);
    for (let i = 0; i < carCount; i++)
      cars.current?.setColorAt(i, resources.colors[(i * 3) % 8]);
    if (bodies.current?.instanceColor)
      bodies.current.instanceColor.needsUpdate = true;
    if (cars.current?.instanceColor)
      cars.current.instanceColor.needsUpdate = true;
  }, [people, traffic, peopleCount, carCount, resources]);

  // 보행 위치·차량 이동은 실제 사람 위치나 실시간 교통량을 뜻하지 않는다.
  useFrame(({ clock }) => {
    if (reducedMotion && initialized.current) return;
    const time = reducedMotion ? 0 : clock.elapsedTime;
    for (let i = 0; i < peopleCount + carCount; i++) {
      const car = i >= peopleCount,
        index = car ? i - peopleCount : i;
      const segment = (car ? traffic : people)[
        index % (car ? traffic.length : people.length)
      ];
      const direction = index % 2 ? -1 : 1;
      const phase =
        (index * 0.61803398875 +
          (time * (car ? 0.009 : 0.0014)) / segment.length) %
        1;
      const t = direction > 0 ? phase : 1 - phase;
      const dx = (segment.b[0] - segment.a[0]) / segment.length,
        dz = (segment.b[1] - segment.a[1]) / segment.length;
      const lane =
        direction * (car ? segment.width / 4 : segment.width / 2 + 0.001);
      dummy.position.set(
        segment.a[0] + dx * segment.length * t - dz * lane,
        LAND_SURFACE_Y + (car ? 0.005 : 0.0035),
        segment.a[1] + dz * segment.length * t + dx * lane,
      );
      dummy.rotation.set(0, Math.atan2(dx * direction, dz * direction), 0);
      dummy.updateMatrix();
      if (car) cars.current?.setMatrixAt(index, dummy.matrix);
      else {
        bodies.current?.setMatrixAt(index, dummy.matrix);
        heads.current?.setMatrixAt(index, dummy.matrix);
      }
    }
    if (bodies.current) bodies.current.instanceMatrix.needsUpdate = true;
    if (heads.current) heads.current.instanceMatrix.needsUpdate = true;
    if (cars.current) cars.current.instanceMatrix.needsUpdate = true;
    initialized.current = true;
  });

  // 실제 GPU 자원을 해제하고 움직이는 인스턴스의 오래된 경계 상자로 잘리지 않게 한다.
  useEffect(
    () => () => {
      resources.body.dispose();
      resources.head.dispose();
      resources.car.dispose();
      resources.bodyMaterial.dispose();
      resources.headMaterial.dispose();
      resources.carMaterial.dispose();
    },
    [resources],
  );
  return (
    <group name="map-street-life" dispose={null}>
      {peopleCount > 0 && (
        <>
          <instancedMesh
            ref={bodies}
            args={[resources.body, resources.bodyMaterial, peopleCount]}
            frustumCulled={false}
          />
          <instancedMesh
            ref={heads}
            args={[resources.head, resources.headMaterial, peopleCount]}
            frustumCulled={false}
          />
        </>
      )}
      {carCount > 0 && (
        <instancedMesh
          ref={cars}
          args={[resources.car, resources.carMaterial, carCount]}
          frustumCulled={false}
        />
      )}
    </group>
  );
}
