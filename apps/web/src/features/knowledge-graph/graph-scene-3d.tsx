// 기준 그래프를 3D로 그린다 — 종류별 색·모양 노드, 선택하면 이웃만 밝히고 카메라가 다가간다.
import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  BufferGeometry as Geometry,
  IcosahedronGeometry,
  MOUSE,
  OctahedronGeometry,
  SphereGeometry,
  TetrahedronGeometry,
  TOUCH,
  TorusGeometry,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useCssVars } from "../../lib/theme/use-css-var";
import type { GraphData, GraphEdge, GraphNode } from "./graph-data";
import { kindStyle, type NodeShape, nodeRadius } from "./graph-style";
import type { Point3 } from "./layout-3d";

const TOKENS = [
  "--cat-1",
  "--cat-2",
  "--cat-3",
  "--cat-4",
  "--cat-5",
  "--cat-6",
  "--cat-7",
  "--ink-2",
  "--muted",
  "--axis",
  "--select",
  "--surface-sunken",
] as const;

// 이름표 칸 수: 선택 1 + 이웃 18 + 마우스 1.
const LABEL_SLOTS = 20;

// 모양별 단위 형상은 한 번만 만들어 모든 노드가 같이 쓴다.
let shapes: Record<NodeShape, BufferGeometry> | null = null;
function shapeGeometry(shape: NodeShape) {
  shapes ??= {
    sphere: new SphereGeometry(1, 20, 14),
    octahedron: new OctahedronGeometry(1.3),
    box: new BoxGeometry(1.6, 1.6, 1.6),
    icosahedron: new IcosahedronGeometry(1.25),
    tetrahedron: new TetrahedronGeometry(1.5),
    cone: new ConeGeometry(1.1, 2, 14),
    torus: new TorusGeometry(0.95, 0.38, 10, 24),
    dot: new SphereGeometry(1, 8, 6),
  };
  return shapes[shape];
}

type SceneProps = {
  data: GraphData;
  positions: Map<string, Point3>;
  degrees: Map<string, number>;
  selectedId: string | null;
  active: Set<string> | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  reducedMotion: boolean;
};

// 캔버스와 조명·안개를 두고 나머지는 장면 안 컴포넌트가 그린다.
export function GraphScene3d(props: SceneProps) {
  const colors = useCssVars(TOKENS);
  const background = colors["--surface-sunken"];
  return (
    <Canvas
      camera={{ position: [0, 160, 720], fov: 45, near: 1, far: 4000 }}
      dpr={[1, 1.5]}
      onPointerMissed={props.onClear}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 680, 1600]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[120, 220, 160]} intensity={1.15} />
      <GraphContent {...props} colors={colors} />
    </Canvas>
  );
}

// 관계 선은 두 묶음(보통·선택 이웃)만 그려 그리기 호출을 줄인다.
function EdgeLines({
  edges,
  positions,
  color,
  opacity,
}: {
  edges: GraphEdge[];
  positions: Map<string, Point3>;
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (const edge of edges) {
      const from = positions.get(edge.source);
      const to = positions.get(edge.target);
      if (from && to) points.push(...from, ...to);
    }
    const next = new Geometry();
    next.setAttribute("position", new Float32BufferAttribute(points, 3));
    return next;
  }, [edges, positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </lineSegments>
  );
}

// 노드·선·이름표·카메라 초점을 한 장면에서 선택 상태와 맞춘다.
function GraphContent({
  data,
  positions,
  degrees,
  selectedId,
  active,
  onSelect,
  reducedMotion,
  colors,
}: SceneProps & { colors: Record<string, string> }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const nodes = useMemo(
    () => new Map(data.nodes.map((node) => [node.id, node])),
    [data.nodes],
  );
  const lit = useMemo(
    () =>
      active
        ? data.edges.filter(
            (edge) => edge.source === selectedId || edge.target === selectedId,
          )
        : [],
    [data.edges, active, selectedId],
  );

  // 선택이 없으면 연결 많은 노드 10개, 있으면 선택과 이웃(최대 18개)에 이름을 붙인다.
  const labelIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedId && active)
      for (const id of [selectedId, ...active].slice(0, 19)) ids.add(id);
    else
      for (const node of [...data.nodes]
        .filter((item) => item.kind !== "file")
        .sort((a, b) => (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0))
        .slice(0, 10))
        ids.add(node.id);
    if (hovered) ids.add(hovered);
    return [...ids].slice(0, LABEL_SLOTS);
  }, [data.nodes, degrees, selectedId, active, hovered]);

  // 선택 노드와 이웃을 감싸는 구의 중심·반지름으로 카메라 목적지를 정한다.
  const focus = useMemo(() => {
    if (!selectedId || !active) return null;
    const points = [...active]
      .map((id) => positions.get(id))
      .filter((point): point is Point3 => Boolean(point));
    if (!points.length) return null;
    const center: Point3 = [0, 1, 2].map(
      (axis) =>
        points.reduce((sum, point) => sum + point[axis], 0) / points.length,
    ) as Point3;
    const radius = Math.max(
      ...points.map((point) =>
        Math.hypot(
          point[0] - center[0],
          point[1] - center[1],
          point[2] - center[2],
        ),
      ),
    );
    return {
      center,
      distance: Math.max(150, ((radius + 14) / Math.sin(Math.PI / 8)) * 1.05),
    };
  }, [selectedId, active, positions]);

  // 마우스를 떠날 때 커서 모양을 되돌린다.
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  return (
    <>
      <EdgeLines
        edges={data.edges}
        positions={positions}
        color={colors["--axis"]}
        opacity={active ? 0.12 : 0.55}
      />
      {lit.length > 0 && (
        <EdgeLines
          edges={lit}
          positions={positions}
          color={colors["--select"]}
          opacity={0.95}
        />
      )}
      {data.nodes.map((node) => {
        const position = positions.get(node.id);
        if (!position) return null;
        const style = kindStyle[node.kind];
        const selected = node.id === selectedId;
        const dim = Boolean(active && !active.has(node.id));
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: R3F 메쉬는 DOM 요소가 아니며 키보드 선택은 검색·표·상세 목록이 맡는다.
          <mesh
            key={node.id}
            position={position}
            scale={
              nodeRadius(node.kind, degrees.get(node.id) ?? 0) *
              (selected ? 1.35 : node.id === hovered ? 1.15 : dim ? 0.6 : 1)
            }
            geometry={shapeGeometry(style.shape)}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(node.id);
            }}
            onPointerOver={(event) => {
              event.stopPropagation();
              setHovered(node.id);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              setHovered((current) => (current === node.id ? null : current));
              document.body.style.cursor = "";
            }}
          >
            <meshStandardMaterial
              color={colors[style.color]}
              emissive={selected ? colors["--select"] : colors[style.color]}
              emissiveIntensity={selected ? 0.7 : 0.14}
              roughness={0.5}
              transparent
              opacity={dim ? 0.14 : 1}
              depthWrite={!dim}
            />
          </mesh>
        );
      })}
      {/* 이름표는 고정 칸을 늘 붙여 두고 내용·위치만 바꾼다(Html을 떼어 내면 React 19에서 DOM 제거 오류가 난다). */}
      {Array.from({ length: LABEL_SLOTS }, (_, slot) => {
        const id = labelIds[slot];
        const node = id ? nodes.get(id) : undefined;
        const position = id ? positions.get(id) : undefined;
        const lift = node
          ? nodeRadius(node.kind, degrees.get(node.id) ?? 0) + 4
          : 0;
        return (
          <Html
            // biome-ignore lint/suspicious/noArrayIndexKey: 칸 번호 자체가 고정 식별자다.
            key={slot}
            position={
              position
                ? [position[0], position[1] + lift, position[2]]
                : [0, -99999, 0]
            }
            center
            zIndexRange={[20, 0]}
            style={{
              pointerEvents: "none",
              display: node ? undefined : "none",
            }}
          >
            <span
              className={`knowledge3d-label${node && node.id === selectedId ? " is-selected" : ""}`}
            >
              {node ? labelText(node) : ""}
            </span>
          </Html>
        );
      })}
      <FocusCamera
        controls={controls}
        focus={focus}
        reducedMotion={reducedMotion}
      />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        autoRotate={!selectedId && !hovered && !reducedMotion}
        autoRotateSpeed={0.35}
        minDistance={40}
        maxDistance={1500}
        zoomToCursor
        mouseButtons={{
          LEFT: MOUSE.PAN,
          MIDDLE: MOUSE.ROTATE,
          RIGHT: MOUSE.ROTATE,
        }}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
    </>
  );
}

// 긴 이름은 이름표에서 줄이고 전체 이름은 상세 패널에서 읽는다.
function labelText(node: GraphNode) {
  return node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label;
}

// 선택한 노드와 이웃이 한 화면에 들어오게 표적과 거리를 옮긴다 — 직접 조작하면 바로 멈춘다.
function FocusCamera({
  controls,
  focus,
  reducedMotion,
}: {
  controls: React.RefObject<OrbitControlsImpl | null>;
  focus: { center: Point3; distance: number } | null;
  reducedMotion: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const goal = useRef<Vector3 | null>(null);
  const goalDistance = useRef(0);
  const offset = useRef(new Vector3());

  // 선택이 바뀔 때만 목적지를 새로 정한다.
  useEffect(() => {
    goal.current = focus ? new Vector3(...focus.center) : null;
    goalDistance.current = focus?.distance ?? 0;
  }, [focus]);

  // 사용자가 끌기 시작하면 자동 이동을 멈춘다.
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const stop = () => {
      goal.current = null;
    };
    orbit.addEventListener("start", stop);
    return () => orbit.removeEventListener("start", stop);
  }, [controls]);

  // 표적과 카메라를 함께 옮기고 거리를 이웃이 모두 보이는 값으로 맞춘다.
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit || !goal.current) return;
    const step = reducedMotion ? 1 : Math.min(1, delta * 3);
    offset.current.copy(camera.position).sub(orbit.target);
    const distance = offset.current.length();
    offset.current.setLength(
      distance + (goalDistance.current - distance) * step,
    );
    orbit.target.lerp(goal.current, step);
    camera.position.copy(orbit.target).add(offset.current);
    orbit.update();
    if (orbit.target.distanceToSquared(goal.current) < 0.05)
      goal.current = null;
  });
  return null;
}
