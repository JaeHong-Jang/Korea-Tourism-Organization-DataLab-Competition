// 성남의 이동·회전·커서 확대·위에서 보기를 하나의 전국 정사영 카메라에 연결한다.
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MOUSE,
  OrthographicCamera,
  Plane,
  Raycaster,
  Spherical,
  TOUCH,
  Vector2,
  Vector3,
} from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import { isSceneCameraKey } from "../camera-rig";
import { unprojectKorea } from "../projection";
import { LAND_SURFACE_Y } from "../scene-height";
import { terrainHeight, type ElevationGrid } from "../terrain/elevation";
import { observePanelBounds, type PanelBounds } from "../scene-panel-bounds";
import { MAP_CAMERA_OFFSET, nationalCameraPose } from "./camera-pose";
import { mapZoom } from "./tile-plan";
import type { MapCommand, MapViewport, NavigationMode } from "./types";

// 기존 캔버스를 유지하며 지역 선택과 수동 조작이 같은 위치·확대 상태를 공유한다.
export function NationalCamera({
  center,
  width,
  depth,
  selected,
  command,
  mode,
  reducedMotion,
  diagnostic = false,
  onView,
  onNavigation,
  elevation,
}: {
  center: [number, number];
  width: number;
  depth: number;
  selected: [number, number] | null;
  command: MapCommand;
  mode: NavigationMode;
  reducedMotion: boolean;
  diagnostic?: boolean;
  onView: (view: MapViewport) => void;
  onNavigation: (active: boolean) => void;
  elevation?: ElevationGrid;
}) {
  const orbit = useRef<Controls>(null);
  const { camera, gl, size, invalidate, performance } = useThree();
  const [bounds, setBounds] = useState<PanelBounds | null>(null);
  const target = useRef(new Vector3(center[0], LAND_SURFACE_Y, center[1]));
  const position = useRef(target.current.clone().add(MAP_CAMERA_OFFSET));
  const zoom = useRef(1),
    moving = useRef(false),
    manual = useRef(false),
    lastCommand = useRef(-1);
  const tools = useMemo(
    () => ({
      plane: new Plane(new Vector3(0, 1, 0), -LAND_SURFACE_Y),
      ray: new Raycaster(),
      point: new Vector3(),
      pointer: new Vector2(),
      corners: [
        new Vector2(-1, -1),
        new Vector2(1, -1),
        new Vector2(-1, 1),
        new Vector2(1, 1),
      ],
    }),
    [],
  );
  const elapsed = useRef(1),
    lastView = useRef(""),
    refresh = useRef<number | undefined>(undefined);

  // 조작 마지막 위치도 한 번 갱신하고 정지 화면에서는 렌더 루프를 계속 돌리지 않는다.
  const changed = useCallback(() => {
    invalidate();
    window.clearTimeout(refresh.current);
    refresh.current = window.setTimeout(() => {
      elapsed.current = 1;
      invalidate();
    }, 180);
  }, [invalidate]);
  useEffect(() => () => window.clearTimeout(refresh.current), []);

  // 패널 크기가 바뀌어도 수동으로 옮긴 지점은 유지하고 초기 전국 구도만 다시 맞춘다.
  useLayoutEffect(() => {
    const stage = gl.domElement.closest(".scene-stage");
    if (!(stage instanceof HTMLElement)) return;
    return observePanelBounds(stage, setBounds);
  }, [gl.domElement]);

  // 진단 모드에서만 기존 카메라 검사 인터페이스와 상세 확대 상태를 제공한다.
  useEffect(() => {
    if (!diagnostic) return;
    window.__crowdcastCameraTarget = () =>
      orbit.current?.target.toArray() ?? null;
    return () => {
      delete window.__crowdcastCameraTarget;
      delete document.documentElement.dataset.sceneMapWidth;
    };
  }, [diagnostic]);

  // 목적지를 보간하거나 모션 줄이기 설정에서는 한 번에 이동한다.
  const move = useCallback(
    (point: Vector3, cameraPosition: Vector3, nextZoom: number) => {
      target.current.copy(point);
      position.current.copy(cameraPosition);
      zoom.current = nextZoom;
      moving.current = true;
      onNavigation(true);
      invalidate();
      if (
        reducedMotion &&
        orbit.current &&
        camera instanceof OrthographicCamera
      ) {
        orbit.current.target.copy(point);
        camera.position.copy(cameraPosition);
        camera.zoom = nextZoom;
        camera.updateProjectionMatrix();
        orbit.current.update();
        moving.current = false;
        onNavigation(false);
        changed();
      }
    },
    [reducedMotion, camera, onNavigation, invalidate, changed],
  );

  // 초기 구도와 외부 카메라 명령도 동일한 카메라를 조작한다.
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera) || !bounds || !orbit.current)
      return;
    const newCommand = lastCommand.current !== command.id;
    if (newCommand) lastCommand.current = command.id;
    if (newCommand && command.kind === "region" && command.point) {
      const point = new Vector3(
        command.point[0],
        LAND_SURFACE_Y,
        command.point[1],
      );
      const offset = camera.position.clone().sub(orbit.current.target);
      move(
        point,
        point.clone().add(offset),
        Math.max(size.width / 90, camera.zoom),
      );
      manual.current = true;
    } else if (newCommand && command.kind === "above") {
      const point = orbit.current.target.clone();
      move(point, point.clone().add(new Vector3(0, 1000, 0.01)), camera.zoom);
      manual.current = true;
    } else if (newCommand && ["zoom-in", "zoom-out"].includes(command.kind)) {
      camera.zoom = Math.max(
        0.1,
        Math.min(
          18000,
          camera.zoom * (command.kind === "zoom-in" ? 1.6 : 1 / 1.6),
        ),
      );
      camera.updateProjectionMatrix();
      orbit.current.update();
      moving.current = false;
      manual.current = true;
      onNavigation(false);
      changed();
    } else if (
      (newCommand && command.kind === "overview") ||
      (!manual.current && !selected)
    ) {
      const pose = nationalCameraPose(bounds, center, width, depth);
      move(pose.target, pose.position, pose.zoom);
      manual.current = false;
    }
  }, [
    command,
    bounds,
    camera,
    size.width,
    center,
    width,
    depth,
    move,
    selected,
    onNavigation,
    changed,
  ]);

  // 행사 선택은 다른 장면으로 바꾸지 않고 같은 지도에서 실제 좌표를 가까이 본다.
  useEffect(() => {
    if (!selected || !orbit.current || !(camera instanceof OrthographicCamera))
      return;
    const point = new Vector3(selected[0], LAND_SURFACE_Y + terrainHeight(elevation, ...selected), selected[1]);
    move(
      point,
      point.clone().add(camera.position.clone().sub(orbit.current.target)),
      size.width / 1.2,
    );
    manual.current = true;
  }, [selected, camera, size.width, move, elevation]);

  // 클릭과 드래그를 구별하고 빈 지점을 누르면 각도·확대를 유지한 채 화면 중심으로 옮긴다.
  useEffect(() => {
    const canvas = gl.domElement;
    let start: { x: number; y: number; id: number } | null = null;
    const pointers = new Set<number>();
    const down = (event: PointerEvent) => {
      pointers.add(event.pointerId);
      start =
        event.button === 0 && pointers.size === 1
          ? { x: event.clientX, y: event.clientY, id: event.pointerId }
          : null;
    };
    const up = (event: PointerEvent) => {
      const before = start;
      start = null;
      pointers.delete(event.pointerId);
      if (
        !before ||
        before.id !== event.pointerId ||
        Math.hypot(event.clientX - before.x, event.clientY - before.y) > 6 ||
        !orbit.current
      )
        return;
      const rect = canvas.getBoundingClientRect();
      tools.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
      tools.ray.setFromCamera(tools.pointer, camera);
      if (!tools.ray.ray.intersectPlane(tools.plane, tools.point)) return;
      const offset = camera.position.clone().sub(orbit.current.target);
      move(
        tools.point,
        tools.point.clone().add(offset),
        (camera as OrthographicCamera).zoom,
      );
      manual.current = true;
    };
    const cancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      start = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
    };
  }, [camera, gl.domElement, tools, move]);

  // 장면에 초점이 있을 때 방향키·Shift 회전·확대·Home을 처리해 입력 폼과 충돌하지 않는다.
  useEffect(() => {
    const stage = gl.domElement.closest(".scene-stage");
    if (!(stage instanceof HTMLElement)) return;
    const key = (event: KeyboardEvent) => {
      const controls = orbit.current;
      if (
        !controls ||
        !(camera instanceof OrthographicCamera) ||
        !isSceneCameraKey(event, stage)
      )
        return;
      const horizontal =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const vertical =
        event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (horizontal || vertical) {
        if (mode === "rotate" || event.shiftKey) {
          const offset = camera.position.clone().sub(controls.target),
            spherical = new Spherical().setFromVector3(offset);
          spherical.theta -= horizontal * 0.12;
          spherical.phi = Math.max(
            0.001,
            Math.min(1.2, spherical.phi + vertical * 0.08),
          );
          camera.position
            .copy(controls.target)
            .add(offset.setFromSpherical(spherical));
        } else {
          const step = size.width / camera.zoom / 18;
          const delta = new Vector3(horizontal * step, 0, vertical * step);
          camera.position.add(delta);
          controls.target.add(delta);
        }
      } else if (["+", "=", "-"].includes(event.key)) {
        camera.zoom = Math.max(
          0.1,
          Math.min(18000, camera.zoom * (event.key === "-" ? 1 / 1.2 : 1.2)),
        );
        camera.updateProjectionMatrix();
      } else if (event.key === "Home" && bounds) {
        const pose = nationalCameraPose(bounds, center, width, depth);
        move(pose.target, pose.position, pose.zoom);
        event.preventDefault();
        manual.current = false;
        return;
      } else return;
      event.preventDefault();
      moving.current = false;
      manual.current = true;
      controls.update();
      onNavigation(false);
      changed();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    camera,
    gl.domElement,
    size.width,
    mode,
    bounds,
    center,
    width,
    depth,
    move,
    onNavigation,
    changed,
  ]);

  // 이동 프레임만 이어 그리며 실제 화면 범위는 표식과 상세 지도 요청에 공유한다.
  useFrame((_, delta) => {
    const controls = orbit.current;
    if (!controls || !(camera instanceof OrthographicCamera)) return;
    if (moving.current) {
      const t = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 0.05) * 12);
      controls.target.lerp(target.current, t);
      camera.position.lerp(position.current, t);
      camera.zoom += (zoom.current - camera.zoom) * t;
      camera.updateProjectionMatrix();
      controls.update();
      if (
        controls.target.distanceToSquared(target.current) <
          Math.max(0.0000001, (0.25 / camera.zoom) ** 2) &&
        Math.abs(camera.zoom - zoom.current) <
          Math.max(0.001, zoom.current * 0.001)
      ) {
        controls.target.copy(target.current);
        camera.position.copy(position.current);
        camera.zoom = zoom.current;
        camera.updateProjectionMatrix();
        controls.update();
        moving.current = false;
        onNavigation(false);
        elapsed.current = 1;
      }
      invalidate();
    }
    elapsed.current += delta;
    if (elapsed.current < 0.35) return;
    elapsed.current = 0;
    camera.updateMatrixWorld();
    const points: [number, number][] = [];
    for (const corner of tools.corners) {
      tools.ray.setFromCamera(corner, camera);
      if (tools.ray.ray.intersectPlane(tools.plane, tools.point))
        points.push(unprojectKorea(tools.point.x, tools.point.z));
    }
    if (points.length < 4) return;
    const location = unprojectKorea(controls.target.x, controls.target.z);
    const span = size.width / camera.zoom;
    const view: MapViewport = {
      center: location,
      width: span,
      zoom: mapZoom(span, location[1]),
      bounds: [
        Math.min(...points.map(([lng]) => lng)),
        Math.min(...points.map(([, lat]) => lat)),
        Math.max(...points.map(([lng]) => lng)),
        Math.max(...points.map(([, lat]) => lat)),
      ],
    };
    const identity = `${view.zoom}:${view.width.toFixed(3)}:${[...view.center, ...view.bounds].map((value) => value.toFixed(6)).join(",")}`;
    if (identity !== lastView.current) {
      lastView.current = identity;
      onView(view);
      if (diagnostic)
        document.documentElement.dataset.sceneMapWidth = String(span);
    }
  });

  // 성남과 동일하게 한 손가락 이동·두 손가락 이동/확대와 커서 중심 확대를 기본으로 둔다.
  return (
    <OrbitControls
      ref={orbit}
      makeDefault
      target={[center[0], LAND_SURFACE_Y, center[1]]}
      enableDamping={!reducedMotion}
      dampingFactor={0.09}
      screenSpacePanning={false}
      zoomToCursor
      minPolarAngle={0.001}
      maxPolarAngle={1.2}
      minZoom={0.1}
      maxZoom={18000}
      mouseButtons={{
        LEFT: mode === "pan" ? MOUSE.PAN : MOUSE.ROTATE,
        MIDDLE: MOUSE.ROTATE,
        RIGHT: MOUSE.ROTATE,
      }}
      touches={{
        ONE: mode === "pan" ? TOUCH.PAN : TOUCH.ROTATE,
        TWO: TOUCH.DOLLY_PAN,
      }}
      onChange={changed}
      onStart={() => {
        moving.current = false;
        manual.current = true;
        onNavigation(true);
        performance.regress();
      }}
      onEnd={() => {
        onNavigation(false);
        changed();
      }}
    />
  );
}
