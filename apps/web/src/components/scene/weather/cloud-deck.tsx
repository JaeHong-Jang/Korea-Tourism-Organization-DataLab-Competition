// 판 위에 가장자리가 흐려지는 둥근 구름 덩어리를 낮게 놓는다.
import { useEffect, useMemo } from "react";
import { Color, DoubleSide, PlaneGeometry, ShaderMaterial } from "three";
import { sceneColor } from "../quality";

// 각 구름 조각의 중심은 판의 안쪽 비율로 고정한다.
export function cloudPuffPosition(
  cluster: number,
  puff: number,
  width: number,
  depth: number,
): [number, number] {
  const offsets = [-0.25, 0.02, 0.25];
  return [
    (offsets[cluster] + puff * 0.45) * width,
    (cluster === 1 ? 0.12 : -0.16) * depth + puff * depth * 0.11,
  ];
}

// 구름 외곽의 알파를 줄여 모형과 깃발을 가리지 않는다.
export function CloudDeck({
  center,
  width,
  depth,
  surfaceY,
}: {
  center: [number, number];
  width: number;
  depth: number;
  surfaceY: number;
}) {
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          cloudColor: { value: new Color(sceneColor("model-canvas")) },
        },
        vertexShader:
          "varying vec2 cloudUv; void main(){cloudUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader:
          "uniform vec3 cloudColor; varying vec2 cloudUv; void main(){float edge=1.0-smoothstep(0.24,0.5,length(cloudUv-0.5)); gl_FragColor=vec4(cloudColor,edge*0.15);}",
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );
  const puffs = [-0.24, 0, 0.23];

  // 판 크기를 기준으로 세 덩어리를 만들고 가장자리에서 안쪽으로만 배치한다.
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return (
    <group position={[center[0], surfaceY + 1.1, center[1]]}>
      {[0, 1, 2].flatMap((cluster) =>
        puffs.map((puff, index) => (
          <mesh
            key={`${cluster}-${puff}`}
            geometry={geometry}
            material={material}
            rotation={[-Math.PI / 2, 0, 0]}
            position={(() => {
              const [x, z] = cloudPuffPosition(cluster, puff, width, depth);
              return [x, index * 0.03, z];
            })()}
            scale={[width * 0.26, depth * 0.14, 1]}
          />
        )),
      )}
    </group>
  );
}
