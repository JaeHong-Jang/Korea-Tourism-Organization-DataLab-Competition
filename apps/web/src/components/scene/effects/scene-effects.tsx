// 높은 품질에만 낮은 샘플 수의 틸트시프트를 적용한다.
import { EffectComposer, TiltShift2 } from "@react-three/postprocessing";
import type { SceneQuality } from "../quality";

// 보통부터 후처리를 끄고 높은 품질에서도 단일 패스로 비용을 제한한다.
export function SceneEffects({ quality }: { quality: SceneQuality }) {
  if (quality !== "high") return null;
  return (
    <EffectComposer multisampling={0}>
      <TiltShift2
        blur={0.025}
        taper={0.3}
        start={[0, 0.45]}
        end={[1, 0.45]}
        samples={1}
        direction={[1, 0]}
      />
    </EffectComposer>
  );
}
