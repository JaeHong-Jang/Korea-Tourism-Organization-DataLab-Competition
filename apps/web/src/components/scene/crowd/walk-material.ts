// 인스턴스별 위상으로 다리를 흔들고 몸통을 살짝 띄우는 정점 애니메이션을 준다.
import {
  type BufferGeometry,
  InstancedBufferAttribute,
  type Material,
} from "three";

type WalkShader = { uniforms: Record<string, { value: number }> };
type WalkMaterial = Material & { userData: { walkShaders?: WalkShader[] } };

// 기존 인형 형상에 인스턴스 위상만 추가해 CPU 행렬 갱신을 피한다.
export function addWalkPhases(geometry: BufferGeometry, count: number): void {
  const phases = Float32Array.from(
    { length: count },
    (_, index) => (index * 2.399963229728653) % (Math.PI * 2),
  );
  geometry.setAttribute("walkPhase", new InstancedBufferAttribute(phases, 1));
}

// 원래 색 재료를 유지하고 정점 단계에만 걷기 변형을 삽입한다.
export function enableWalking(material: WalkMaterial): WalkMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.walkTime = { value: 0 };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nattribute float walkPhase;\nuniform float walkTime;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float stepWave = sin(walkTime * 4.0 + walkPhase);
      if (position.y < 0.72) transformed.x += sign(position.x) * stepWave * 0.095;
      transformed.y += abs(stepWave) * 0.045;`,
    );
    if (!material.userData.walkShaders) material.userData.walkShaders = [];
    material.userData.walkShaders.push(shader);
  };
  material.customProgramCacheKey = () => "crowdcast-walking-1";
  return material;
}

// 모션 감소에서는 위상을 0초에 고정하고 재료를 다시 만들지 않는다.
export function walkingTime(
  material: WalkMaterial,
  elapsed: number,
  reducedMotion: boolean,
): void {
  const shaders = material.userData.walkShaders;
  if (!shaders) return;
  for (let index = 0; index < shaders.length; index++)
    shaders[index].uniforms.walkTime.value = reducedMotion ? 0 : elapsed;
}
