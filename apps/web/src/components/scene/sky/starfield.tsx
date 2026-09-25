// 밤 하늘의 별을 크기·밝기가 다른 점으로 흩고 각자 다른 박자로 반짝이게 한다.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ShaderMaterial,
} from "three";

const vertexShader = /* glsl */ `
attribute float size;
attribute float phase;
attribute vec3 tint;
uniform float time;
uniform float pixelRatio;
varying float vTwinkle;
varying vec3 vTint;
void main() {
  float speed = 0.5 + fract(phase * 7.13) * 1.4;
  vTwinkle = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(time * speed + phase * 6.2832), 2.0);
  vTint = tint;
  gl_PointSize = size * pixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float opacity;
varying float vTwinkle;
varying vec3 vTint;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.35, d);
  float halo = 1.0 - smoothstep(0.0, 1.0, d);
  float alpha = (core + halo * halo * 0.45) * vTwinkle * opacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vTint, alpha);
  #include <colorspace_fragment>
}
`;

// 같은 판에서는 늘 같은 하늘이 되도록 고정 씨앗의 난수를 쓴다.
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

// 판 밑(바로 아래) 방향만 빼고 구 표면에 고르게 흩는다.
export function starGeometry(count: number, radius: number) {
  const random = seeded(20260925);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const tints = new Float32Array(count * 3);
  let index = 0;
  while (index < count) {
    const y = random() * 2 - 1;
    if (y < -0.9) continue;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - y * y);
    positions.set(
      [
        Math.cos(angle) * ring * radius,
        y * radius,
        Math.sin(angle) * ring * radius,
      ],
      index * 3,
    );
    const bright = random() > 0.93;
    sizes[index] = bright ? 7 + random() * 4 : 2.2 + random() ** 3 * 4;
    phases[index] = random();
    const warm = random();
    tints.set(
      warm > 0.8 ? [1, 0.93, 0.78] : warm < 0.25 ? [0.82, 0.9, 1] : [1, 1, 1],
      index * 3,
    );
    index++;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("size", new BufferAttribute(sizes, 1));
  geometry.setAttribute("phase", new BufferAttribute(phases, 1));
  geometry.setAttribute("tint", new BufferAttribute(tints, 3));
  return geometry;
}

// 움직임 줄이기에서는 반짝임을 멈추고 한 번만 그린다.
export function Starfield({
  center,
  count,
  opacity = 1,
  reducedMotion,
}: {
  center: [number, number];
  count: number;
  opacity?: number;
  reducedMotion: boolean;
}) {
  const pixelRatio = useThree((state) => state.viewport.dpr);
  const geometry = useMemo(() => starGeometry(count, 2400), [count]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          time: { value: 0 },
          pixelRatio: { value: 1 },
          opacity: { value: 1 },
        },
        vertexShader,
        fragmentShader,
      }),
    [],
  );

  // 화면 배율·투명도는 바뀔 때만 셰이더에 넣는다.
  useEffect(() => {
    material.uniforms.pixelRatio.value = pixelRatio;
    material.uniforms.opacity.value = opacity;
  }, [material, pixelRatio, opacity]);

  // 형상과 셰이더는 개수 변경·해제 때 정리한다.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // 반짝임 시간만 매 프레임 올린다(새 객체를 만들지 않는다).
  useFrame((_, delta) => {
    if (!reducedMotion) material.uniforms.time.value += delta;
  });

  return (
    <points
      geometry={geometry}
      material={material}
      position={[center[0], 0, center[1]]}
      renderOrder={-9}
      frustumCulled={false}
    />
  );
}
