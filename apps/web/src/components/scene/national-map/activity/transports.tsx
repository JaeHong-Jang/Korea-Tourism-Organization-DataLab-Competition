// 기존 비행기·배 부품을 병합해 화면 안에서만 그리며 기차는 앞 차량의 실제 이동 궤적을 따른다.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  type InstancedMesh,
  Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PLANE } from "../../motion/planes";
import { SHIP } from "../../motion/ships";
import { sceneColor } from "../../quality";
import { LAND_SURFACE_Y } from "../../scene-height";
import { terrainHeight, type ElevationGrid } from "../../terrain/elevation";
import type { ActivitySimulation } from "./simulation";
import { trailingPoint } from "./train-trail";

// 여러 부품의 색상을 정점으로 합쳐 비행기와 배 각각 한 번의 그리기로 처리한다.
export function TransportFleet({
  simulation,
  kind,
  elevation,
  scale = 1,
}: {
  simulation: ActivitySimulation;
  kind: "air" | "sea";
  elevation?: ElevationGrid;
  scale?: number;
}) {
  const ref = useRef<InstancedMesh>(null),
    object = useMemo(() => new Object3D(), []);
  const geometry = useMemo(() => {
    const multiplier = kind === "air" ? 0.03 : 0.02;
    const parts = (kind === "air" ? PLANE : SHIP).map((p) => {
      const g = new BoxGeometry(...p.scale).toNonIndexed();
      g.translate(...p.offset);
      g.scale(multiplier, multiplier, multiplier);
      const color = new Color(
          sceneColor(Array.isArray(p.color) ? p.color[0] : p.color),
        ),
        colors = new Float32Array(g.getAttribute("position").count * 3);
      for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
      g.setAttribute("color", new Float32BufferAttribute(colors, 3));
      return g;
    });
    const result = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return result;
  }, [kind]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    if (!ref.current) return;
    simulation.actors.forEach((a, i) => {
      const altitude =
        kind === "air"
          ? Math.max(1.2, terrainHeight(elevation, a.x, a.z) + 0.6)
          : 0.003;
      object.position.set(a.x, LAND_SURFACE_Y + altitude, a.z);
      object.rotation.set(0, a.heading, 0);
      object.scale.setScalar(a.fade * scale);
      object.updateMatrix();
      ref.current!.setMatrixAt(i, object.matrix);
    });
    ref.current.count = simulation.actors.length;
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      name={`activity-${kind}`}
      ref={ref}
      args={[geometry, undefined, 12]}
      frustumCulled={false}
      userData={{ simulation }}
    >
      <meshLambertMaterial vertexColors />
    </instancedMesh>
  );
}

// 열차 편성은 최대 여섯 편성으로 제한하고 경로가 없는 화면에는 생성하지 않는다.
export function ActivityTrains({
  simulation,
  elevation,
}: {
  simulation: ActivitySimulation;
  elevation?: ElevationGrid;
}) {
  const body = useRef<InstancedMesh>(null),
    glass = useRef<InstancedMesh>(null),
    stripe = useRef<InstancedMesh>(null),
    object = useMemo(() => new Object3D(), []);
  useFrame(() => {
    let count = 0;
    for (const actor of simulation.actors)
      for (let car = 0; car < 3; car++) {
        const p = trailingPoint(actor, car * 0.023);
        if (!p) continue;
        object.position.set(
          p[0],
          LAND_SURFACE_Y + 0.0052 + terrainHeight(elevation, p[0], p[1]),
          p[1],
        );
        object.rotation.set(0, p[2], 0);
        object.scale.setScalar(actor.fade);
        object.updateMatrix();
        for (const ref of [body, glass, stripe])
          ref.current?.setMatrixAt(count, object.matrix);
        count++;
      }
    for (const ref of [body, glass, stripe])
      if (ref.current) {
        ref.current.count = count;
        ref.current.instanceMatrix.needsUpdate = true;
      }
  });
  return (
    <group name="activity-trains" userData={{ simulation }}>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, 18]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.004, 0.004, 0.02]} />
        <meshLambertMaterial color="#e3e8ea" />
      </instancedMesh>
      <instancedMesh
        ref={glass}
        args={[undefined, undefined, 18]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.0042, 0.0015, 0.016]} />
        <meshLambertMaterial color="#263d51" />
      </instancedMesh>
      <instancedMesh
        ref={stripe}
        args={[undefined, undefined, 18]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.0043, 0.0006, 0.018]} />
        <meshLambertMaterial color="#3d8cba" />
      </instancedMesh>
    </group>
  );
}
