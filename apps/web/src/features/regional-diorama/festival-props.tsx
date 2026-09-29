// 파스텔 부스·작은 공연 무대·가랜드와 간헐적 색종이로 축제 분위기를 연출한다.
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, Object3D } from "three";
import { useTheme } from "../../lib/theme/theme-provider";
import { festivalDecorationGeometry } from "./festival-decoration-geometry";
import type { FestivalProp } from "./festival-layout";

const COLORS = ["#d98268", "#e5b953", "#5d9f92", "#779ab7", "#a88eb4"];

// 짧은 분출 뒤 쉬는 색종이는 조명·후처리 없이 한 번에 그린다.
export function Confetti({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const transform = useRef(new Object3D());
  useLayoutEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < 72; i++)
      ref.current.setColorAt(i, new Color(COLORS[i % COLORS.length]));
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime % 11;
    ref.current.visible = !reducedMotion && t < 4.5;
    if (!ref.current.visible) return;
    for (let i = 0; i < 72; i++) {
      const angle = i * 2.39996;
      const speed = 2 + (i % 6);
      const age = Math.max(0, t - (i % 6) * 0.09);
      const object = transform.current;
      object.position.set(
        Math.cos(angle) * age * speed,
        5 + age * (15 + (i % 5)) - 4.2 * age * age,
        Math.sin(angle) * age * speed,
      );
      object.rotation.set(age * 2 + i, age * 3, angle);
      object.scale.setScalar(object.position.y > 1 ? 0.55 : 0);
      object.updateMatrix();
      ref.current.setMatrixAt(i, object.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, 72]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 0.12, 0.6]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}

// 정적 시설은 하나의 메시로 그리고 밤에는 부스의 발광과 바닥 조명을 더한다.
export function FestivalProps({
  props,
  reducedMotion,
}: {
  props: FestivalProp[];
  reducedMotion: boolean;
}) {
  const { sky } = useTheme();
  const night = sky !== "day";
  const geometry = useMemo(() => festivalDecorationGeometry(props), [props]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return (
    <group name="festival-props">
      {geometry && (
        <mesh geometry={geometry} receiveShadow>
          <meshLambertMaterial
            vertexColors
            emissive={night ? "#b58b52" : "#000000"}
            emissiveIntensity={night ? 0.25 : 0}
          />
        </mesh>
      )}
      {props.map((p) => (
        <group key={`${p.x},${p.z}`} position={[p.x, 0, p.z]}>
          {p.stage && <Confetti reducedMotion={reducedMotion} />}
          {night && p.stage && (
            <pointLight
              position={[0, 32, 12]}
              color="#ffdb9e"
              intensity={8000}
              distance={210}
              decay={2}
            />
          )}
          {night && (
            <>
              <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[p.stage ? 23 : 11, 24]} />
                <meshBasicMaterial
                  color="#edb557"
                  transparent
                  opacity={0.14}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0, p.stage ? 15 : 6, 0]}>
                <boxGeometry args={[p.stage ? 20 : 8, 0.3, 0.3]} />
                <meshBasicMaterial color="#ffe4a1" />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}
