// 동네 길을 걷는 사람과 행사장에 모인 사람을 몸·머리·머리카락·팔·다리로 만든 인형으로 연출한다(실제 위치 아님).
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  type InstancedMesh,
  MeshLambertMaterial,
  Vector3,
} from "three";
import type { MotionPoint, MotionRoute } from "../motion/rail-lines";
import { sceneColor } from "../quality";
import { vehicleAt } from "../venue/routes";
import { newFocus, refocus } from "./focus-routes";
import { type Pose, stamp, swing } from "./stamp";

// 이 거리보다 멀면 몸·머리만 그리는 간단한 모습으로 바꾼다(m).
export const FAR_DISTANCE = 700;
const ORIGIN = new Vector3();

// 멀리서도 사람으로 읽히게 키운 배율(범례에 "크기는 보이게 키움"으로 밝힌다).
export const PERSON_SCALE = 3.6;

// 품질별 걷는 사람·모인 사람 수 상한 — 동네 전체(wide)에 흩을 때는 걷는 사람을 두 배 가까이 둔다.
export function walkerCaps(quality: "high" | "medium" | "low", wide = false) {
  return quality === "high"
    ? { walk: wide ? 720 : 360, gather: 360 }
    : quality === "medium"
      ? { walk: wide ? 420 : 220, gather: 220 }
      : { walk: wide ? 160 : 100, gather: 100 };
}

// 사람 한 명 = 몸 1·머리 1·머리카락 1·팔 2·다리 2 (단위 m, 키 약 1.75m).
const BODY = { at: [0, 1.12, 0], size: [0.44, 0.62, 0.26] } as const;
const HEAD = { at: [0, 1.6, 0], size: [0.3, 0.32, 0.3] } as const;
const HAIR = { at: [0, 1.72, -0.02], size: [0.32, 0.14, 0.32] } as const;
const ARM = {
  joint: 1.4,
  x: 0.29,
  half: 0.3,
  size: [0.12, 0.6, 0.14],
} as const;
const LEG = {
  joint: 0.8,
  x: 0.11,
  half: 0.4,
  size: [0.16, 0.8, 0.18],
} as const;

// 옷·살색·머리·바지 색은 사람마다 다른 조합(서로소 주기)으로 섞는다.
function palette(prefix: string, count: number) {
  return Array.from(
    { length: count },
    (_, index) => new Color(sceneColor(`${prefix}-${index + 1}`)),
  );
}

export function CityPeople({
  routes,
  nearby = [],
  wide = false,
  walkers,
  gather,
  towardShare,
  quality,
  reducedMotion,
  blocked,
}: {
  routes: MotionRoute[];
  // 확대했을 때 보는 곳 근처에 세울 짧은 경로 모음(동네 전체에 촘촘히 깔림).
  nearby?: MotionRoute[];
  // 동네 3D처럼 동네 전체 길에 흩을 때 true(사람 수를 늘린다).
  wide?: boolean;
  // 걷는 사람 수를 따로 정할 때(귀가 행렬) — 없으면 품질 상한.
  walkers?: number;
  gather: number;
  towardShare: number;
  quality: "high" | "medium" | "low";
  reducedMotion: boolean;
  // 건물 외곽선 안이면 true — 모인 사람을 건물 속에 세우지 않는다.
  blocked?: (x: number, z: number, margin?: number) => boolean;
}) {
  const caps = walkerCaps(quality, wide);
  const walkCount = routes.length ? (walkers ?? caps.walk) : 0;
  const gatherCount = Math.min(caps.gather, Math.max(0, Math.round(gather)));
  const total = walkCount + gatherCount;
  const bodies = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const hair = useRef<InstancedMesh>(null);
  const arms = useRef<InstancedMesh>(null);
  const legs = useRef<InstancedMesh>(null);
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  // 머리는 20면 다면체, 머리카락은 상자 — 소프트웨어 렌더러에서도 사람 한 명이 삼각형 약 90개.
  const round = useMemo(() => new IcosahedronGeometry(0.5, 0), []);
  const material = useMemo(
    () => new MeshLambertMaterial({ flatShading: true }),
    [],
  );
  const point = useMemo<MotionPoint>(() => ({ x: 0, z: 0, heading: 0 }), []);
  const pose = useMemo<Pose>(
    () => ({ x: 0, y: 0.3, z: 0, heading: 0, size: PERSON_SCALE }),
    [],
  );

  // 부품 행렬을 한 사람씩 적는다 — 걸음(gait)은 팔다리를 관절 기준으로 반대로 흔든다.
  const place = (index: number, gait: number, full = true) => {
    const b = bodies.current;
    const h = heads.current;
    const r = hair.current;
    const a = arms.current;
    const l = legs.current;
    if (!b || !h || !r || !a || !l) return;
    const bob = Math.abs(gait) * 0.04;
    pose.y = 0.3 + bob * PERSON_SCALE;
    stamp(b.instanceMatrix.array, index, pose, [...BODY.at], [...BODY.size]);
    stamp(h.instanceMatrix.array, index, pose, [...HEAD.at], [...HEAD.size]);
    if (!full) return;
    stamp(r.instanceMatrix.array, index, pose, [...HAIR.at], [...HAIR.size]);
    for (const side of [-1, 1]) {
      const slot = index * 2 + (side < 0 ? 0 : 1);
      const armPitch = -side * gait;
      const legPitch = side * gait;
      stamp(
        a.instanceMatrix.array,
        slot,
        pose,
        swing([side * ARM.x, ARM.joint, 0], ARM.half, armPitch),
        [...ARM.size],
        armPitch,
      );
      stamp(
        l.instanceMatrix.array,
        slot,
        pose,
        swing([side * LEG.x, LEG.joint, 0], LEG.half, legPitch),
        [...LEG.size],
        legPitch,
      );
    }
  };
  // count명(팔다리는 두 배)까지만 올린다 — 서 있는 사람 행렬은 처음 한 번만 보낸다.
  const upload = (count = total, full = true) => {
    for (const mesh of full
      ? [bodies, heads, hair, arms, legs]
      : [bodies, heads]) {
      const target = mesh.current;
      if (!target) continue;
      const parts = mesh === arms || mesh === legs ? 2 : 1;
      target.instanceMatrix.clearUpdateRanges();
      target.instanceMatrix.addUpdateRange(0, count * parts * 16);
      target.instanceMatrix.needsUpdate = true;
    }
  };

  // 색과 모인 사람의 자리(황금각 나선, 무대 쪽을 봄)는 한 번만 기록한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: place·upload는 같은 ref와 자세 객체만 쓴다.
  useLayoutEffect(() => {
    const shirts = palette("person", 8);
    const skins = palette("skin", 4);
    const hairs = palette("hair", 4);
    const trousers = palette("trouser", 4);
    for (let index = 0; index < total; index++) {
      bodies.current?.setColorAt(index, shirts[index % 8]);
      heads.current?.setColorAt(index, skins[(index * 3) % 4]);
      hair.current?.setColorAt(index, hairs[(index * 5) % 4]);
      for (let side = 0; side < 2; side++) {
        arms.current?.setColorAt(index * 2 + side, shirts[index % 8]);
        legs.current?.setColorAt(index * 2 + side, trousers[(index * 7) % 4]);
      }
    }
    // 나선을 따라 바깥으로 가며 건물 속 자리는 건너뛴다(최대 네 배까지 시도).
    for (
      let placed = 0, step = 0;
      placed < gatherCount && step < gatherCount * 4;
      step++
    ) {
      const angle = step * 2.399963229728653;
      const radius = 30 + Math.sqrt(step) * 6;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (blocked?.(x, z, 1.5)) continue;
      pose.x = x;
      pose.z = z;
      pose.heading = Math.atan2(-x, -z);
      place(walkCount + placed, 0);
      placed++;
    }
    for (const mesh of [bodies, heads, hair, arms, legs]) {
      const target = mesh.current;
      if (!target) continue;
      target.instanceMatrix.setUsage(DynamicDrawUsage);
      if (target.instanceColor) target.instanceColor.needsUpdate = true;
    }
    upload();
  }, [total, walkCount, gatherCount, blocked]);

  // 걷는 사람은 골목·보행로 가장자리를 따라 움직이고 일부는 행사장 쪽으로 향한다.
  // 멀리서 볼 때(700m 넘게)는 팔다리·머리카락이 점보다 작아 몸·머리만 그리고, 모두 동네 전체 길에 흩어 둔다.
  // 확대하면 열에 여섯은 보는 곳 근처 짧은 길로 옮겨 가까이 본 거리가 비어 보이지 않게 한다.
  const detail = useRef(true);
  const focus = useMemo(newFocus, []);
  useFrame(({ clock, camera, controls }) => {
    const target = (controls as { target?: Vector3 } | null)?.target;
    const full = camera.position.distanceTo(target ?? ORIGIN) < FAR_DISTANCE;
    if (full !== detail.current) {
      detail.current = full;
      if (hair.current) hair.current.count = full ? total : 0;
      if (arms.current) arms.current.count = full ? total * 2 : 0;
      if (legs.current) legs.current.count = full ? total * 2 : 0;
    }
    if (walkCount === 0) return;
    if (full) refocus(focus, nearby, target?.x ?? 0, target?.z ?? 0);
    const near = full ? focus.routes : [];
    const seconds = reducedMotion ? 0 : clock.elapsedTime * 1.4;
    for (let index = 0; index < walkCount; index++) {
      const route =
        near.length && index % 5 < 3
          ? near[(index * 7) % near.length]
          : routes[index % routes.length];
      vehicleAt(
        route,
        seconds + index * 3.1,
        index,
        index % 100 < towardShare * 100,
        point,
      );
      const side = (index % 2 === 0 ? 1 : -1) * (3.9 + (index % 3) * 0.5);
      pose.x = point.x + Math.cos(point.heading) * side;
      pose.z = point.z - Math.sin(point.heading) * side;
      pose.heading = point.heading;
      const gait = reducedMotion
        ? 0
        : Math.sin(clock.elapsedTime * 7 + index * 1.7) * 0.55;
      place(index, gait, full);
    }
    upload(walkCount, full);
  });

  // 형상과 재료는 화면을 떠날 때 해제한다.
  useEffect(
    () => () => {
      box.dispose();
      round.dispose();
      material.dispose();
    },
    [box, round, material],
  );

  if (total === 0) return null;
  return (
    <group key={total}>
      <instancedMesh
        ref={bodies}
        args={[box, material, total]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={heads}
        args={[round, material, total]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={hair}
        args={[box, material, total]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={arms}
        args={[box, material, total * 2]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={legs}
        args={[box, material, total * 2]}
        frustumCulled={false}
      />
    </group>
  );
}
