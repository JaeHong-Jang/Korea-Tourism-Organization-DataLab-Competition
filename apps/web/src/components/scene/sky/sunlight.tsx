// 낮에는 화면 왼쪽 위에서 따뜻한 햇빛이 번지고 옅은 빛줄기가 천천히 일렁인다(장식 — 해 위치가 아니다).
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, Color, ShaderMaterial } from "three";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 sun;
uniform float aspect;
uniform float time;
uniform float strength;
varying vec2 vUv;
void main() {
  vec2 source = vec2(0.08, 1.12);
  vec2 delta = (vUv - source) * vec2(aspect, 1.0);
  float distance = length(delta);
  float glow = exp(-distance * 3.2) * 0.3;
  float angle = atan(delta.y, delta.x);
  float rays = pow(0.5 + 0.5 * sin(angle * 22.0 + time * 0.08), 14.0);
  rays *= (0.55 + 0.45 * sin(angle * 5.0 - time * 0.05)) * smoothstep(1.5, 0.15, distance) * 0.16;
  gl_FragColor = vec4(sun * (glow + rays) * strength, 1.0);
  #include <colorspace_fragment>
}
`;

// 화면 전체 사각형을 장면 뒤 순서로 더해 그린다(깊이 검사 없음).
export function Sunlight({
  color,
  reducedMotion,
}: {
  color: string;
  reducedMotion: boolean;
}) {
  const size = useThree((state) => state.size);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          sun: { value: new Color() },
          aspect: { value: 1 },
          time: { value: 0 },
          strength: { value: 1 },
        },
        vertexShader,
        fragmentShader,
      }),
    [],
  );

  // 색과 화면 비율이 바뀔 때만 셰이더 값을 고친다.
  useEffect(() => {
    material.uniforms.sun.value.set(color);
    material.uniforms.aspect.value = size.width / Math.max(1, size.height);
  }, [material, color, size.width, size.height]);

  // 장면을 떠나면 셰이더를 해제한다.
  useEffect(() => () => material.dispose(), [material]);

  // 빛줄기만 아주 천천히 돌리고 움직임 줄이기에서는 멈춘다.
  useFrame((_, delta) => {
    if (!reducedMotion) material.uniforms.time.value += delta;
  });

  return (
    <mesh material={material} renderOrder={1000} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
