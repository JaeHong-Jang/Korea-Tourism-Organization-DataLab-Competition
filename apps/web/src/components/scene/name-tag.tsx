// 행사 이름표를 카메라 거리와 화면 충돌에 맞춰 제한한다.
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { Matrix4, Vector3 } from "three";
import type { PlacedFestival } from "./festival-models/placement";
import { GradeMark } from "./grade-mark";
import { LAND_SURFACE_Y } from "./scene-height";

export type TagBox = { id: string; level: number; x: number; y: number };
const CLOSE_WIDTH = 158;
const CLOSE_HEIGHT = 48;
const FAR_WIDTH = 106;
const FAR_HEIGHT = 30;
const FAR_DISTANCE = 850;

// 높은 등급부터 보면서 같은 등급은 행사 ID 순서로 고정한다.
export function visibleTagIds(boxes: TagBox[], far = false): string[] {
  const picked: TagBox[] = [];
  const width = far ? FAR_WIDTH : CLOSE_WIDTH;
  const height = far ? FAR_HEIGHT : CLOSE_HEIGHT;
  const maximum = far ? 6 : boxes.length;
  for (const box of [...boxes].sort(
    (a, b) => b.level - a.level || a.id.localeCompare(b.id),
  )) {
    if (picked.length >= maximum) break;
    if (
      picked.every(
        (other) =>
          Math.abs(other.x - box.x) >= width ||
          Math.abs(other.y - box.y) >= height,
      )
    )
      picked.push(box);
  }
  return picked.map((box) => box.id);
}

// 먼 시점에도 견본 번호와 실제 행사명 앞부분을 읽을 수 있게 줄인다.
function shortFestivalName(name: string): string {
  if (name.startsWith("견본 행사 ")) return name.replace("견본 행사 ", "견본 ");
  return name.length > 7 ? `${name.slice(0, 6)}…` : name;
}

// 카메라 이동 중에도 같은 버퍼를 재사용하고 표시 집합이 바뀔 때만 렌더한다.
export function NameTags({
  placed,
  center,
}: {
  placed: PlacedFestival[];
  center: [number, number];
}) {
  const { camera, size } = useThree();
  const [display, setDisplay] = useState<{ ids: string[]; far: boolean }>({
    ids: [],
    far: true,
  });
  const previous = useRef(new Matrix4());
  const previousWidth = useRef(0);
  const previousHeight = useRef(0);
  const previousFar = useRef(true);
  const point = useRef(new Vector3());
  const picked = useRef<TagBox[]>([]);
  const shown = useRef(display);
  const previousBoxes = useRef<unknown>(null);
  const boxes = useMemo(
    () =>
      placed
        .map(({ festival, x, z }) => ({
          id: festival.eventId,
          level: festival.level,
          x: 0,
          y: 0,
          worldX: x,
          worldZ: z,
          visible: false,
        }))
        .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id)),
    [placed],
  );

  // 실제 이름표 크기와 같은 경계로 가리고 먼 시점에는 여섯 개까지만 남긴다.
  useFrame(() => {
    const distance = Math.hypot(
      camera.position.x - center[0],
      camera.position.y,
      camera.position.z - center[1],
    );
    const far = distance > FAR_DISTANCE;
    if (
      previous.current.equals(camera.matrixWorld) &&
      previousWidth.current === size.width &&
      previousHeight.current === size.height &&
      previousFar.current === far &&
      previousBoxes.current === boxes
    )
      return;
    previous.current.copy(camera.matrixWorld);
    previousWidth.current = size.width;
    previousHeight.current = size.height;
    previousFar.current = far;
    previousBoxes.current = boxes;
    const active = picked.current;
    active.length = 0;
    const width = far ? FAR_WIDTH : CLOSE_WIDTH;
    const height = far ? FAR_HEIGHT : CLOSE_HEIGHT;
    for (const box of boxes) {
      point.current
        .set(box.worldX, LAND_SURFACE_Y + 9, box.worldZ)
        .project(camera);
      box.visible =
        point.current.z < 1 &&
        Math.abs(point.current.x) <= 1.1 &&
        Math.abs(point.current.y) <= 1.1;
      box.x = ((point.current.x + 1) * size.width) / 2;
      box.y = ((1 - point.current.y) * size.height) / 2;
      if (!box.visible || (far && active.length >= 6)) continue;
      let overlaps = false;
      for (const other of active) {
        if (
          Math.abs(other.x - box.x) < width &&
          Math.abs(other.y - box.y) < height
        ) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) active.push(box);
    }
    const current = shown.current;
    if (
      current.far !== far ||
      current.ids.length !== active.length ||
      current.ids.some((id, index) => id !== active[index].id)
    ) {
      shown.current = { ids: active.map((box) => box.id), far };
      setDisplay(shown.current);
    }
  });

  // 표시는 DOM 크기로 유지하되 패널·헤더보다 낮은 층에 둔다.
  const selected = useMemo(() => new Set(display.ids), [display.ids]);
  return (
    <group>
      {placed
        .filter(({ festival }) => selected.has(festival.eventId))
        .map(({ festival, x, z }) => (
          <Html
            key={festival.eventId}
            position={[x, LAND_SURFACE_Y + 9, z]}
            center
            zIndexRange={[9, 1]}
            style={{ pointerEvents: "none" }}
          >
            <div
              className={`scene-name-tag${display.far ? " scene-name-tag--far" : ""}`}
            >
              <strong>
                {display.far ? shortFestivalName(festival.name) : festival.name}
              </strong>
              <GradeMark level={festival.level} />
            </div>
          </Html>
        ))}
    </group>
  );
}
