// 행사 이름표를 카메라 거리와 화면 충돌에 맞춰 제한한다.
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Matrix4, Vector3 } from "three";
import type { PlacedFestival } from "./festival-models/placement";
import { GradeMark } from "./grade-mark";
import { LAND_SURFACE_Y } from "./scene-height";
import { type ScreenRect, tagFitsSafeArea } from "./tag-visibility";

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
  selectedId,
  onPick,
}: {
  placed: PlacedFestival[];
  center: [number, number];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const { camera, size, gl } = useThree();
  const [display, setDisplay] = useState<{ ids: string[]; far: boolean }>({
    ids: [],
    far: true,
  });
  const previous = useRef(new Matrix4());
  const previousWidth = useRef(0);
  const previousHeight = useRef(0);
  const previousFar = useRef(true);
  const previousSelected = useRef<string | null>(null);
  const previousBlockersRevision = useRef(-1);
  const blockersRevision = useRef(0);
  const blockers = useRef<ScreenRect[]>([]);
  const point = useRef(new Vector3());
  const picked = useRef<TagBox[]>([]);
  const shown = useRef(display);
  const previousBoxes = useRef<unknown>(null);
  const boxes = useMemo(
    () =>
      placed
        .map(({ festival, x, y, z }) => ({
          id: festival.eventId,
          level: festival.level,
          x: 0,
          y: 0,
          worldX: x,
          worldY: y,
          worldZ: z,
          visible: false,
        }))
        .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id)),
    [placed],
  );

  // 패널을 펼치거나 화면 크기가 바뀔 때만 클릭 금지 영역을 다시 읽는다.
  useLayoutEffect(() => {
    const stage = gl.domElement.closest(".scene-stage");
    const page = stage?.closest(".scene-page");
    if (!stage || !page) return;
    const panels = Array.from(
      page.querySelectorAll<HTMLElement>(
        ".scene-left-rail, .scene-list, .scene-timeline, .scene-cta",
      ),
    );
    const measure = () => {
      const stageRect = stage.getBoundingClientRect();
      blockers.current = panels.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left - stageRect.left,
          top: rect.top - stageRect.top,
          right: rect.right - stageRect.left,
          bottom: rect.bottom - stageRect.top,
        };
      });
      blockersRevision.current++;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    panels.forEach((panel) => {
      observer.observe(panel);
    });
    measure();
    return () => observer.disconnect();
  }, [gl.domElement]);

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
      previousSelected.current === selectedId &&
      previousBlockersRevision.current === blockersRevision.current &&
      previousBoxes.current === boxes
    )
      return;
    previous.current.copy(camera.matrixWorld);
    previousWidth.current = size.width;
    previousHeight.current = size.height;
    previousFar.current = far;
    previousSelected.current = selectedId;
    previousBlockersRevision.current = blockersRevision.current;
    previousBoxes.current = boxes;
    const active = picked.current;
    active.length = 0;
    const width = far ? FAR_WIDTH : CLOSE_WIDTH;
    const height = far ? FAR_HEIGHT : CLOSE_HEIGHT;
    // 선택한 이름표가 먼저 자리를 잡고(1회차) 나머지는 그와 겹치면 빠진다(2회차) — 새 배열 없이 두 번 훑는다.
    for (let pass = 0; pass < 2; pass++) {
      for (const box of boxes) {
        if ((box.id === selectedId) !== (pass === 0)) continue;
        point.current
          .set(box.worldX, LAND_SURFACE_Y + box.worldY + 9, box.worldZ)
          .project(camera);
        box.visible =
          point.current.z >= -1 &&
          point.current.z < 1 &&
          Math.abs(point.current.x) <= 1 &&
          Math.abs(point.current.y) <= 1;
        box.x = ((point.current.x + 1) * size.width) / 2;
        box.y = ((1 - point.current.y) * size.height) / 2;
        box.visible &&= tagFitsSafeArea(
          box.x,
          box.y,
          width,
          height,
          size.width,
          size.height,
          blockers.current,
        );
        if (
          !box.visible ||
          (far && active.length >= 6 && box.id !== selectedId)
        )
          continue;
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
        .map(({ festival, x, y, z }) => (
          <Html
            key={festival.eventId}
            position={[x, LAND_SURFACE_Y + y + 9, z]}
            center
            zIndexRange={[9, 1]}
            style={{ pointerEvents: "auto" }}
          >
            <button
              type="button"
              className={`scene-name-tag is-clickable${display.far ? " scene-name-tag--far" : ""}${selectedId === festival.eventId ? " is-selected" : ""}`}
              aria-label={`${festival.name} 선택`}
              aria-pressed={selectedId === festival.eventId}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onPick(festival.eventId);
              }}
            >
              <strong>
                {display.far ? shortFestivalName(festival.name) : festival.name}
              </strong>
              <GradeMark level={festival.level} />
            </button>
          </Html>
        ))}
    </group>
  );
}
