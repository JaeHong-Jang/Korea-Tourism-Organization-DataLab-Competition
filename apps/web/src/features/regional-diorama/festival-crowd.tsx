// 관람객이 축제 주변에서 천천히 걷고 작은 몸짓으로 대화하는 모습을 그린다.
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, DynamicDrawUsage, type InstancedMesh } from "three";
import { type Pose, stamp, swing } from "../../components/scene/city/stamp";
import type { Point } from "../../components/scene/venue/coordinates";
import type { VenueTiles } from "../../components/scene/venue/tiles";
import { createCrowdWalk, type CrowdGoal } from "./crowd-walking";
const EMPTY_GOALS: CrowdGoal[] = [];

// 다섯 개의 드로 콜로 몸·머리·머리카락·팔다리를 그리며 React 재렌더링을 피한다.
export function FestivalCrowd({
  tiles,
  center,
  reducedMotion,
  heightAt,
  allowed,
  goals = EMPTY_GOALS,
  limit = 360,
}: {
  tiles: VenueTiles;
  center: Point;
  reducedMotion: boolean;
  heightAt?: (x: number, z: number) => number;
  allowed?: (x: number, z: number) => boolean;
  goals?: CrowdGoal[];
  limit?: number;
}) {
  const walking = useMemo(
    () => createCrowdWalk(tiles, center, goals, 360, allowed),
    [tiles, center[0], center[1], goals, allowed],
  );
  const positions = useMemo(
    () => walking.people.slice(0, limit),
    [walking, limit],
  );
  const body = useRef<InstancedMesh>(null);
  const head = useRef<InstancedMesh>(null);
  const arms = useRef<InstancedMesh>(null);
  const legs = useRef<InstancedMesh>(null);
  const hair = useRef<InstancedMesh>(null);
  const pose = useMemo<Pose>(
    () => ({ x: 0, y: 0.3, z: 0, heading: 0, size: 3.6 }),
    [],
  );
  // 옷 색상을 고정해 카메라를 움직여도 같은 관람객으로 보이게 한다.
  useLayoutEffect(() => {
    const colors = [
      "#a77868",
      "#b5a384",
      "#72816d",
      "#596f88",
      "#737181",
      "#e5dfd3",
    ].map((value) => new Color(value));
    for (let i = 0; i < positions.length; i++) {
      body.current?.setColorAt(i, colors[i % colors.length]);
      arms.current?.setColorAt(i * 2, colors[i % colors.length]);
      arms.current?.setColorAt(i * 2 + 1, colors[i % colors.length]);
    }
    for (const mesh of [
      body.current,
      head.current,
      arms.current,
      legs.current,
      hair.current,
    ]) {
      mesh?.instanceMatrix.setUsage(DynamicDrawUsage);
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [positions]);
  // 검증된 경로를 실제로 이동하며 보행 속도에 맞춰 팔다리를 움직인다.
  useFrame(({ clock }, delta) => {
    const b = body.current,
      h = head.current,
      a = arms.current,
      l = legs.current,
      r = hair.current;
    if (!b || !h || !a || !l || !r) return;
    const time = reducedMotion ? 0 : clock.elapsedTime;
    if (!reducedMotion && !document.hidden)
      walking.step(delta, positions.length);
    positions.forEach((person, i) => {
      const phase = i * 2.39996;
      const gait =
        !reducedMotion && person.moving ? Math.sin(person.stride) * 0.35 : 0;
      const gesture =
        !reducedMotion && !person.moving && i % 7 === 0
          ? Math.max(0, Math.sin(time * 0.65 + phase)) * 0.35
          : 0;
      pose.x = person.x;
      pose.z = person.z;
      pose.size = 2.1 + (i % 5) * 0.1;
      pose.y =
        0.2 + Math.abs(gait) * 0.025 + (heightAt?.(person.x, person.z) ?? 0);
      pose.heading = person.heading;
      stamp(b.instanceMatrix.array, i, pose, [0, 1.1, 0], [0.43, 0.62, 0.26]);
      stamp(h.instanceMatrix.array, i, pose, [0, 1.58, 0], [0.29, 0.32, 0.29]);
      stamp(
        r.instanceMatrix.array,
        i,
        pose,
        [0, 1.71, -0.02],
        [0.31, 0.13, 0.31],
      );
      for (const side of [-1, 1]) {
        const pitch = -side * gait - (side > 0 ? gesture : 0);
        stamp(
          a.instanceMatrix.array,
          i * 2 + (side > 0 ? 1 : 0),
          pose,
          swing([side * 0.28, 1.38, 0], 0.28, pitch),
          [0.12, 0.56, 0.13],
          pitch,
        );
        stamp(
          l.instanceMatrix.array,
          i * 2 + (side > 0 ? 1 : 0),
          pose,
          swing([side * 0.12, 0.79, 0], 0.38, side * gait),
          [0.16, 0.76, 0.19],
          side * gait,
        );
      }
    });
    for (const mesh of [b, h, a, l, r]) mesh.instanceMatrix.needsUpdate = true;
  });
  if (!positions.length) return null;
  return (
    <group
      name="festival-crowd"
      userData={{ count: positions.length, walking }}
    >
      <instancedMesh
        ref={legs}
        args={[undefined, undefined, positions.length * 2]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial color="#455064" />
      </instancedMesh>
      <instancedMesh
        ref={hair}
        args={[undefined, undefined, positions.length]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial color="#44372e" />
      </instancedMesh>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, positions.length]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh
        ref={head}
        args={[undefined, undefined, positions.length]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[0.5, 0]} />
        <meshLambertMaterial color="#efd0ad" />
      </instancedMesh>
      <instancedMesh
        ref={arms}
        args={[undefined, undefined, positions.length * 2]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}
