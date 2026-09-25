// 판 둘레의 빈 공간을 해 상태별 세로 그라데이션 공으로 채운다.
import { useEffect, useMemo } from "react";
import { BackSide, Color, ShaderMaterial } from "three";

const vertexShader = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 bottom;
varying vec3 vDirection;
void main() {
  float h = vDirection.y;
  vec3 below = mix(bottom, horizon, smoothstep(-0.95, 0.02, h));
  vec3 above = mix(horizon, top, smoothstep(0.0, 0.55, h));
  gl_FragColor = vec4(h > 0.0 ? above : below, 1.0);
  #include <colorspace_fragment>
}
`;

// 카메라가 판 가까이에서 움직이므로 판 중심에 큰 반지름으로 고정하고 깊이는 쓰지 않는다.
export function SkyDome({
  center,
  top,
  horizon,
  bottom,
}: {
  center: [number, number];
  top: string;
  horizon: string;
  bottom: string;
}) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new Color() },
          horizon: { value: new Color() },
          bottom: { value: new Color() },
        },
        vertexShader,
        fragmentShader,
      }),
    [],
  );

  // 테마가 바뀔 때만 세 색을 다시 넣는다.
  useEffect(() => {
    material.uniforms.top.value.set(top);
    material.uniforms.horizon.value.set(horizon);
    material.uniforms.bottom.value.set(bottom);
  }, [material, top, horizon, bottom]);

  // 장면을 떠나면 셰이더를 해제한다.
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      position={[center[0], 0, center[1]]}
      material={material}
      renderOrder={-10}
      frustumCulled={false}
    >
      <sphereGeometry args={[3000, 32, 16]} />
    </mesh>
  );
}
