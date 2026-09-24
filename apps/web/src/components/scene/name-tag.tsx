// 행사 이름표의 화면 겹침을 등급 우선으로 조정한다.
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { Matrix4, Vector3 } from "three";
import type { PlacedFestival } from "./festival-models/placement";
import { GradeMark } from "./grade-mark";
import { LAND_SURFACE_Y } from "./scene-height";

export type TagBox = { id: string; level: number; x: number; y: number };

// 가까운 이름표가 겹치면 높은 등급을 먼저 남기고 같은 등급은 ID로 고정한다.
export function visibleTagIds(boxes: TagBox[]): string[] {
  const picked: TagBox[] = [];
  for (const box of [...boxes].sort(
    (a, b) => b.level - a.level || a.id.localeCompare(b.id),
  )) {
    if (
      picked.every(
        (other) =>
          Math.abs(other.x - box.x) >= 148 || Math.abs(other.y - box.y) >= 38,
      )
    )
      picked.push(box);
  }
  return picked.map((box) => box.id);
}

// 카메라가 움직일 때만 화면 좌표를 다시 투영해 이름표를 고른다.
export function NameTags({ placed }: { placed: PlacedFestival[] }) {
  const { camera, size } = useThree();
  const [visible, setVisible] = useState<string[]>([]);
  const previous = useRef(new Matrix4());
  const previousSize = useRef({ width: 0, height: 0 });
  const previousPlaced = useRef<PlacedFestival[] | null>(null);
  const point = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (
      previous.current.equals(camera.matrixWorld) &&
      previousSize.current.width === size.width &&
      previousSize.current.height === size.height &&
      previousPlaced.current === placed
    )
      return;
    previous.current.copy(camera.matrixWorld);
    previousSize.current.width = size.width;
    previousSize.current.height = size.height;
    previousPlaced.current = placed;
    const boxes: TagBox[] = [];
    for (const { festival, x, z } of placed) {
      point.set(x, LAND_SURFACE_Y + 5.5, z).project(camera);
      if (point.z >= 1 || Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1)
        continue;
      boxes.push({
        id: festival.eventId,
        level: festival.level,
        x: ((point.x + 1) * size.width) / 2,
        y: ((1 - point.y) * size.height) / 2,
      });
    }
    setVisible(visibleTagIds(boxes));
  });
  const selected = useMemo(() => new Set(visible), [visible]);
  return (
    <group>
      {placed
        .filter(({ festival }) => selected.has(festival.eventId))
        .map(({ festival, x, z }) => (
          <Html
            key={festival.eventId}
            position={[x, LAND_SURFACE_Y + 5.5, z]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div className="scene-name-tag">
              <strong>{festival.name}</strong>
              <GradeMark level={festival.level} />
            </div>
          </Html>
        ))}
    </group>
  );
}
