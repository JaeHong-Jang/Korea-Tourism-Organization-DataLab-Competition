// 기존 차체·유리·바퀴·등 모델을 재사용하며 전역 경로 상태를 인스턴스 행렬에 적는다.
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh } from "three";
import { stampCar, kindOf } from "../../city/vehicle-kit";
import { terrainHeight, type ElevationGrid } from "../../terrain/elevation";
import { LAND_SURFACE_Y } from "../../scene-height";
import type { ActivitySimulation } from "./simulation";
const CAP = 180;
const PAINT = [
  "#d9634d",
  "#f1c34a",
  "#477fae",
  "#eff2ee",
  "#79a294",
  "#596378",
  "#e39056",
];

// 화면 밖 객체는 시뮬레이션 여유 영역에 남기되 가까운 화면에서만 작은 부품을 그린다.
export function ActivityVehicles({
  simulation,
  elevation,
  detail,
  night,
}: {
  simulation: ActivitySimulation;
  elevation?: ElevationGrid;
  detail: boolean;
  night: boolean;
}) {
  const body = useRef<InstancedMesh>(null),
    glass = useRef<InstancedMesh>(null),
    roof = useRef<InstancedMesh>(null),
    wheel = useRef<InstancedMesh>(null),
    head = useRef<InstancedMesh>(null),
    tail = useRef<InstancedMesh>(null);
  const refs = useMemo(() => ({ body, glass, roof, wheel, head, tail }), []);
  const paintIds = useMemo(() => new Int32Array(CAP).fill(-1), []),
    paint = useMemo(() => new Color(), []);
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, heading: 0, size: 1 }), []);
  useLayoutEffect(() => {
    for (let i = 0; i < CAP; i++) {
      const color = new Color(
        i % 12 === 0
          ? "#248cc2"
          : i % 5 === 0
            ? "#f2b634"
            : PAINT[i % PAINT.length],
      );
      body.current?.setColorAt(i, color);
      roof.current?.setColorAt(i, color);
    }
    for (const r of [body, roof])
      if (r.current?.instanceColor) r.current.instanceColor.needsUpdate = true;
  }, []);
  useFrame(() => {
    const parts = {
      body: body.current?.instanceMatrix.array,
      glass: glass.current?.instanceMatrix.array,
      roof: roof.current?.instanceMatrix.array,
      wheel: wheel.current?.instanceMatrix.array,
      head: head.current?.instanceMatrix.array,
      tail: tail.current?.instanceMatrix.array,
    };
    simulation.actors.forEach((actor, index) => {
      pose.x = actor.x;
      pose.z = actor.z;
      pose.y =
        LAND_SURFACE_Y + 0.0035 + terrainHeight(elevation, actor.x, actor.z);
      pose.heading = actor.heading;
      pose.size = 0.00125 * actor.fade;
      if (paintIds[index] !== actor.id) {
        paintIds[index] = actor.id;
        paint.set(
          actor.id % 12 === 0
            ? "#248cc2"
            : actor.id % 5 === 0
              ? "#f2b634"
              : PAINT[actor.id % PAINT.length],
        );
        body.current?.setColorAt(index, paint);
        roof.current?.setColorAt(index, paint);
        if (body.current?.instanceColor)
          body.current.instanceColor.needsUpdate = true;
        if (roof.current?.instanceColor)
          roof.current.instanceColor.needsUpdate = true;
      }
      stampCar(
        parts as Parameters<typeof stampCar>[0],
        index,
        pose,
        detail ? 2 : 0,
        kindOf(actor.id),
      );
    });
    for (const [key, ref] of Object.entries(refs))
      if (ref.current) {
        ref.current.count =
          simulation.actors.length *
          (key === "wheel" ? 4 : key === "head" || key === "tail" ? 2 : 1);
        ref.current.instanceMatrix.needsUpdate = true;
      }
  });
  return (
    <group name="activity-cars" userData={{ simulation }}>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, CAP]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh
        ref={glass}
        args={[undefined, undefined, CAP]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial color="#33495c" />
      </instancedMesh>
      <instancedMesh
        ref={roof}
        args={[undefined, undefined, CAP]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh
        ref={wheel}
        visible={detail}
        args={[undefined, undefined, CAP * 4]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial color="#303a41" />
      </instancedMesh>
      <instancedMesh
        ref={head}
        visible={detail}
        args={[undefined, undefined, CAP * 2]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshBasicMaterial color={night ? "#fff3b6" : "#d9e6e9"} />
      </instancedMesh>
      <instancedMesh
        ref={tail}
        visible={detail}
        args={[undefined, undefined, CAP * 2]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshBasicMaterial color="#df4b3e" />
      </instancedMesh>
    </group>
  );
}
