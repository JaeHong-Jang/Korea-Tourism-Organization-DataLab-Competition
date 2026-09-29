// 기존 관람객의 머리·몸·팔다리 표현을 도시 전체 보행 경로에 연결한다.
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef, useMemo } from "react";
import { Color, type InstancedMesh } from "three";
import { stamp, swing } from "../../city/stamp";
import { terrainHeight, type ElevationGrid } from "../../terrain/elevation";
import { LAND_SURFACE_Y } from "../../scene-height";
import type { ActivitySimulation } from "./simulation";
const CAP = 640;
const COLORS = [
  "#ac6858",
  "#d6b267",
  "#65927a",
  "#567ea6",
  "#9383a2",
  "#e9e4d8",
];

// 보행 거리에 맞춰 팔다리를 흔들고 체류 상태에서는 작은 몸짓만 사용한다.
export function ActivityPeople({
  simulation,
  elevation,
  reduced,
}: {
  simulation: ActivitySimulation;
  elevation?: ElevationGrid;
  reduced: boolean;
}) {
  const body = useRef<InstancedMesh>(null),
    head = useRef<InstancedMesh>(null),
    hair = useRef<InstancedMesh>(null),
    arms = useRef<InstancedMesh>(null),
    legs = useRef<InstancedMesh>(null);
  const paintIds = useMemo(() => new Int32Array(CAP).fill(-1), []),
    paint = useMemo(() => new Color(), []);
  useLayoutEffect(() => {
    for (let i = 0; i < CAP; i++) {
      const c = new Color(COLORS[i % COLORS.length]);
      body.current?.setColorAt(i, c);
      arms.current?.setColorAt(i * 2, c);
      arms.current?.setColorAt(i * 2 + 1, c);
    }
    for (const r of [body, arms])
      if (r.current?.instanceColor) r.current.instanceColor.needsUpdate = true;
  }, []);
  useFrame(() => {
    if (
      !body.current ||
      !head.current ||
      !hair.current ||
      !arms.current ||
      !legs.current
    )
      return;
    simulation.actors.forEach((person, i) => {
      if (paintIds[i] !== person.id) {
        paintIds[i] = person.id;
        paint.set(COLORS[person.id % COLORS.length]);
        body.current!.setColorAt(i, paint);
        arms.current!.setColorAt(i * 2, paint);
        arms.current!.setColorAt(i * 2 + 1, paint);
        body.current!.instanceColor!.needsUpdate = true;
        arms.current!.instanceColor!.needsUpdate = true;
      }
      const gait =
        !reduced && person.moving ? Math.sin(person.stride) * 0.35 : 0;
      const gesture =
        !reduced && !person.moving
          ? Math.max(0, Math.sin(person.age * 0.7 + person.id)) * 0.22
          : 0;
      const pose = {
        x: person.x,
        z: person.z,
        y:
          LAND_SURFACE_Y +
          0.0015 +
          terrainHeight(elevation, person.x, person.z),
        heading: person.heading,
        size: (0.0019 + (person.id % 4) * 0.0001) * person.fade,
      };
      stamp(
        body.current!.instanceMatrix.array,
        i,
        pose,
        [0, 1.1, 0],
        [0.43, 0.62, 0.26],
      );
      stamp(
        head.current!.instanceMatrix.array,
        i,
        pose,
        [0, 1.58, 0],
        [0.29, 0.32, 0.29],
      );
      stamp(
        hair.current!.instanceMatrix.array,
        i,
        pose,
        [0, 1.71, -0.02],
        [0.31, 0.13, 0.31],
      );
      for (const side of [-1, 1]) {
        const pitch = -side * gait - (side > 0 ? gesture : 0),
          slot = i * 2 + (side > 0 ? 1 : 0);
        stamp(
          arms.current!.instanceMatrix.array,
          slot,
          pose,
          swing([side * 0.28, 1.38, 0], 0.28, pitch),
          [0.12, 0.56, 0.13],
          pitch,
        );
        stamp(
          legs.current!.instanceMatrix.array,
          slot,
          pose,
          swing([side * 0.12, 0.79, 0], 0.38, side * gait),
          [0.16, 0.76, 0.19],
          side * gait,
        );
      }
    });
    for (const [mesh, multiplier] of [
      [body.current, 1],
      [head.current, 1],
      [hair.current, 1],
      [arms.current, 2],
      [legs.current, 2],
    ] as const) {
      mesh.count = simulation.actors.length * multiplier;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group name="activity-people" userData={{ simulation }}>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, CAP]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh
        ref={head}
        args={[undefined, undefined, CAP]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[0.5, 0]} />
        <meshLambertMaterial color="#efd0ad" />
      </instancedMesh>
      <instancedMesh
        ref={hair}
        args={[undefined, undefined, CAP]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial color="#44372e" />
      </instancedMesh>
      <instancedMesh
        ref={arms}
        args={[undefined, undefined, CAP * 2]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh
        ref={legs}
        args={[undefined, undefined, CAP * 2]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial color="#455064" />
      </instancedMesh>
    </group>
  );
}
