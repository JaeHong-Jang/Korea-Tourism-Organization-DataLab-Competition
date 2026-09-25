// 높은 품질에는 틸트시프트와 블룸, 보통 품질에는 약한 블룸만 적용한다.
import { Bloom, EffectComposer, TiltShift2 } from "@react-three/postprocessing";
import type { SceneQuality } from "../quality";

// 후처리 비용을 제한하려고 낮은 해상도와 적은 블러 샘플을 사용한다.
export function SceneEffects({ quality }: { quality: SceneQuality }) {
  if (quality === "low") return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={quality === "high" ? 0.32 : 0.2}
        luminanceThreshold={0.8}
        luminanceSmoothing={0.15}
        mipmapBlur
      />
      {quality === "high" && (
        <TiltShift2
          blur={0.035}
          taper={0.3}
          start={[0, 0.45]}
          end={[1, 0.45]}
          samples={4}
          direction={[1, 0]}
        />
      )}
    </EffectComposer>
  );
}
