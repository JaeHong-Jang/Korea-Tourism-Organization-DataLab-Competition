// 선택한 행사 위에 예보팀 색의 작은 저폴리 고래 봇을 띄운다.
import { useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  CylinderGeometry,
  type Group,
  MeshBasicMaterial,
  SphereGeometry,
} from "three";
import type { PlacedFestival } from "../festival-models/placement";
import type { SceneQuality } from "../quality";
import { sceneColor } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import { motionSeconds } from "./rail-lines";

const BOT_IDS = [0, 1, 2];

// 느린 원운동과 위아래 흔들림은 같은 시각이면 같은 위치에 둔다.
export function WhaleBots({
  selected,
  quality,
  reducedMotion,
  diagnostic,
}: {
  selected: PlacedFestival | null;
  quality: SceneQuality;
  reducedMotion: boolean;
  diagnostic: boolean;
}) {
  const clock = useThree((state) => state.clock);
  const groups = useRef<(Group | null)[]>([]);
  const count = selected
    ? quality === "high"
      ? 3
      : quality === "medium"
        ? 2
        : 1
    : 0;
  const body = useMemo(() => new SphereGeometry(2.5, 8, 6), []);
  const fin = useMemo(() => new CylinderGeometry(0, 1.3, 2.3, 3), []);
  const visor = useMemo(() => new SphereGeometry(1.45, 8, 6), []);
  const eye = useMemo(() => new SphereGeometry(0.18, 6, 4), []);
  const shells = useMemo(
    () =>
      ["--team-lead", "--team-analysis", "--team-verification"].map(
        (token) =>
          new MeshBasicMaterial({
            color: getComputedStyle(document.documentElement)
              .getPropertyValue(token)
              .trim(),
          }),
      ),
    [],
  );
  const face = useMemo(
    () => new MeshBasicMaterial({ color: sceneColor("model-roof") }),
    [],
  );
  const pupil = useMemo(
    () =>
      new MeshBasicMaterial({
        color: getComputedStyle(document.documentElement)
          .getPropertyValue("--on-brand")
          .trim(),
      }),
    [],
  );

  // 봇을 고른 모형 주변에만 두고 정지 설정에서는 첫 위치를 유지한다.
  const place = useCallback(
    (seconds: number) => {
      for (let index = 0; index < count; index++) {
        const bot = groups.current[index];
        if (!bot) continue;
        const angle = seconds * 0.28 + (index * Math.PI * 2) / count;
        bot.position.set(
          Math.cos(angle) * 7,
          8 + Math.sin(seconds * 0.9 + index) * 1.2,
          Math.sin(angle) * 7,
        );
        bot.rotation.y = -angle;
      }
    },
    [count],
  );

  // 행사 선택이나 품질이 바뀌면 새 봇 수와 위치를 즉시 반영한다.
  useLayoutEffect(
    () => place(motionSeconds(clock.getElapsedTime(), reducedMotion)),
    [clock, place, reducedMotion],
  );
  useFrame((state) => {
    if (count && !reducedMotion)
      place(motionSeconds(state.clock.elapsedTime, reducedMotion));
  });

  // 진단용 봇 수는 선택 해제 시 영으로 돌아가게 한다.
  useEffect(() => {
    if (!diagnostic) return;
    document.documentElement.dataset.sceneBots = String(count);
    return () => {
      delete document.documentElement.dataset.sceneBots;
    };
  }, [count, diagnostic]);

  // 형상과 팀 색 재료를 장면에서 내릴 때 해제한다.
  useEffect(
    () => () => {
      body.dispose();
      fin.dispose();
      visor.dispose();
      eye.dispose();
      shells.forEach((material) => {
        material.dispose();
      });
      face.dispose();
      pupil.dispose();
    },
    [body, fin, visor, eye, shells, face, pupil],
  );

  if (!selected) return null;
  return (
    <group position={[selected.x, LAND_SURFACE_Y + selected.y + 7, selected.z]}>
      {BOT_IDS.slice(0, count).map((index) => (
        <group
          key={index}
          ref={(group) => {
            groups.current[index] = group;
          }}
        >
          <mesh
            geometry={body}
            material={shells[index]}
            scale={[1.35, 0.75, 1]}
          />
          <mesh
            geometry={fin}
            material={shells[index]}
            position={[0, 0, -3.1]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          <mesh
            geometry={fin}
            material={shells[index]}
            position={[-2.9, 0, 0]}
            rotation={[0, 0, -Math.PI / 2]}
            scale={[0.7, 0.7, 0.7]}
          />
          <mesh
            geometry={fin}
            material={shells[index]}
            position={[2.9, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
            scale={[0.7, 0.7, 0.7]}
          />
          <mesh
            geometry={visor}
            material={face}
            position={[0, 0.15, 2.45]}
            scale={[1, 0.52, 0.23]}
          />
          <mesh
            geometry={eye}
            material={pupil}
            position={[-0.65, 0.28, 2.78]}
          />
          <mesh geometry={eye} material={pupil} position={[0.65, 0.28, 2.78]} />
        </group>
      ))}
    </group>
  );
}
