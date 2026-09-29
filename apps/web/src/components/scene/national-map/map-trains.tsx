// 지상 철도를 따라 달리는 세 칸짜리 열차를 인스턴스로 표시한다.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type InstancedMesh, Object3D } from "three";
import { LAND_SURFACE_Y } from "../scene-height";
import { terrainHeight, type ElevationGrid } from "../terrain/elevation";
import { trainCarAt, trainRoutes } from "./train-routes";
import type { MapPoint, MapRoad } from "./types";

// 모션 줄이기와 비활성 탭에서는 추가 프레임을 요청하지 않는다.
export function MapTrains({
  roads,
  center,
  reducedMotion,
  elevation,
}: {
  roads: MapRoad[];
  center: MapPoint;
  reducedMotion: boolean;
  elevation?: ElevationGrid;
}) {
  const routes = useMemo(
    () => trainRoutes(roads, center),
    [roads, center[0], center[1]],
  );
  const body = useRef<InstancedMesh>(null),
    glass = useRef<InstancedMesh>(null),
    stripe = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const point = useMemo(() => ({ x: 0, z: 0, heading: 0 }), []);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (reducedMotion || !routes.length) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) invalidate();
    }, 1000 / 24);
    return () => window.clearInterval(timer);
  }, [routes, reducedMotion, invalidate]);
  // 진단 모드에서만 현재 선로에 배치된 편성 수를 기록한다.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("sceneDiagnostic") !== "1")
      return;
    document.documentElement.dataset.mapTrains = String(routes.length);
    return () => {
      delete document.documentElement.dataset.mapTrains;
    };
  }, [routes]);
  useFrame(({ clock }) => {
    if (!body.current || !glass.current || !stripe.current) return;
    routes.forEach((route, index) => {
      for (let car = 0; car < 3; car++) {
        trainCarAt(
          route,
          reducedMotion ? 0 : clock.elapsedTime,
          index,
          car,
          point,
        );
        dummy.position.set(
          center[0] + point.x / 1000,
          LAND_SURFACE_Y + 0.0052,
          center[1] + point.z / 1000,
        );
        dummy.rotation.set(0, point.heading, 0);
        dummy.position.y += terrainHeight(elevation, dummy.position.x, dummy.position.z);
        dummy.updateMatrix();
        const slot = index * 3 + car;
        body.current?.setMatrixAt(slot, dummy.matrix);
        glass.current?.setMatrixAt(slot, dummy.matrix);
        stripe.current?.setMatrixAt(slot, dummy.matrix);
      }
    });
    for (const mesh of [body.current, glass.current, stripe.current])
      mesh.instanceMatrix.needsUpdate = true;
  });
  if (!routes.length) return null;
  return (
    <group name="map-trains">
      <instancedMesh
        ref={body}
        args={[undefined, undefined, routes.length * 3]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.004, 0.004, 0.02]} />
        <meshLambertMaterial color="#e3e8ea" />
      </instancedMesh>
      <instancedMesh
        ref={glass}
        args={[undefined, undefined, routes.length * 3]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.0042, 0.0015, 0.016]} />
        <meshLambertMaterial color="#263d51" />
      </instancedMesh>
      <instancedMesh
        ref={stripe}
        args={[undefined, undefined, routes.length * 3]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.0043, 0.0006, 0.018]} />
        <meshLambertMaterial color="#3d8cba" />
      </instancedMesh>
    </group>
  );
}
