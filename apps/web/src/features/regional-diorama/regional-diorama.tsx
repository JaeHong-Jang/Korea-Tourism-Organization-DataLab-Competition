// 성남 3D 여행의 직교 도시 스타일로 선택한 축제 주변을 탐색한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ACESFilmicToneMapping, PCFShadowMap, Vector3 } from "three";
import { useScenePreferences } from "../../components/scene/scene-options";
import {
  loadCityTiles,
  type VenueTiles,
} from "../../components/scene/venue/tiles";
import { useAssistantStore } from "../../lib/consult-store";
import { useTheme } from "../../lib/theme/theme-provider";
import { RegionalBuildings } from "./regional-buildings";
import { RegionalControls } from "./regional-controls";
import { RegionalGround } from "./regional-ground";
import { RegionalLife } from "./regional-life";
import "./regional-diorama.css";

// 축제 좌표를 화면 위치로 투영해 이름표가 카메라 이동을 따라가게 한다.
function PinPosition({ pin }: { pin: RefObject<HTMLButtonElement | null> }) {
  const point = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    if (!pin.current) return;
    point.current.set(0, 30, 0).project(camera);
    const { x, y, z } = point.current;
    pin.current.style.visibility =
      Math.abs(x) > 1 || Math.abs(y) > 1 || Math.abs(z) > 1
        ? "hidden"
        : "visible";
    pin.current.style.left = `${((x + 1) * size.width) / 2}px`;
    pin.current.style.top = `${((1 - y) * size.height) / 2}px`;
  });
  return null;
}

export function RegionalDiorama({
  festival,
  center,
  onOverview,
}: {
  festival: FestivalSummary | null;
  center: [number, number];
  onOverview: () => void;
}) {
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const { sky } = useTheme();
  const night = sky === "night";
  const dusk = sky === "dusk";
  const pin = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState<{
    tiles: VenueTiles;
    offset: [number, number];
  } | null>(null);
  const [status, setStatus] = useState("주변 건물과 도로를 불러오고 있어요.");
  const [command, setCommand] = useState({ id: 0, type: "reset" });
  const { reducedMotion, visible } = useScenePreferences();
  const chooseFestival = useAssistantStore((state) => state.chooseFestival);
  const [lng, lat] = center;

  // 같은 카메라 위치를 유지한 채 이동한 구역의 건물·도로만 교체한다.
  const move = useCallback((x: number, z: number) => {
    setFocus((old) =>
      Math.hypot(x - old[0], z - old[1]) > 450 ? [x, z] : old,
    );
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const longitude =
      lng + focus[0] / (111320 * Math.cos((lat * Math.PI) / 180));
    const latitude = lat - focus[1] / 111320;
    setStatus("주변 건물과 도로를 불러오고 있어요.");
    loadCityTiles([longitude, latitude], controller.signal, 2200)
      .then((tiles) => {
        if (controller.signal.aborted) return;
        setLoaded({ tiles, offset: focus });
        setStatus(
          tiles.buildings.length
            ? ""
            : "이 지역은 공개지도 건물 자료가 부족해요. 도로와 지형을 표시해요.",
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus(
            "지역 자료를 불러오지 못했어요. 전국 보기에서 다시 선택해 주세요.",
          );
      });
    return () => controller.abort();
  }, [lng, lat, focus]);
  const act = (type: string) => setCommand((old) => ({ id: old.id + 1, type }));

  return (
    <section
      className="regional-diorama"
      data-sky={sky}
      aria-label="선택한 축제 지역 3D 지도"
      data-buildings={loaded?.tiles.buildings.length ?? 0}
      onDoubleClick={(event) => {
        if (event.target instanceof HTMLCanvasElement) onOverview();
      }}
    >
      <Canvas
        orthographic
        shadows={{ type: PCFShadowMap }}
        dpr={[1, 1.5]}
        frameloop={visible ? "always" : "never"}
        camera={{ position: [1100, 1500, 1350], near: 1, far: 20000, zoom: 1 }}
        gl={{
          antialias: true,
          powerPreference: "low-power",
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
        }}
      >
        <color
          attach="background"
          args={[night ? "#121d30" : dusk ? "#666079" : "#edf2e6"]}
        />
        <hemisphereLight
          args={[
            night ? "#8298c7" : "#eef7ff",
            night ? "#172137" : "#7c876a",
            night ? 1.05 : dusk ? 1.3 : 2.8,
          ]}
        />
        <directionalLight
          color={night ? "#a6bde5" : dusk ? "#ffc58d" : "#fff3d6"}
          intensity={night ? 0.65 : dusk ? 1.8 : 4}
          position={[-1800, 3300, 2000]}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-2500}
          shadow-camera-right={2500}
          shadow-camera-top={2500}
          shadow-camera-bottom={-2500}
          shadow-camera-near={1}
          shadow-camera-far={10000}
          shadow-bias={-0.00025}
          shadow-normalBias={0.4}
        />
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.1, 0]}
          receiveShadow
        >
          <planeGeometry args={[100000, 100000]} />
          <meshLambertMaterial
            color={night ? "#465066" : dusk ? "#92968a" : "#c5d0b8"}
          />
        </mesh>
        {loaded && (
          <group position={[loaded.offset[0], 0, loaded.offset[1]]}>
            <RegionalGround tiles={loaded.tiles} />
            <RegionalBuildings buildings={loaded.tiles.buildings} />
            <RegionalLife
              tiles={loaded.tiles}
              reducedMotion={reducedMotion}
              festivalCenter={
                festival ? [-loaded.offset[0], -loaded.offset[1]] : null
              }
            />
          </group>
        )}
        {festival && (
          <>
            <mesh position={[0, 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[10, 14, 32]} />
              <meshBasicMaterial color="#d8ae5f" depthTest={false} />
            </mesh>
            <PinPosition pin={pin} />
          </>
        )}
        <RegionalControls command={command} onMove={move} />
      </Canvas>
      {festival && (
        <button
          ref={pin}
          className="regional-pin"
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => chooseFestival(festival)}
        >
          {festival.image?.url && <img src={festival.image.url} alt="" />}
          <span>
            <small>
              {festival.sigunguName} · {festival.type}
            </small>
            <strong>{festival.name}</strong>
            <small>예보 상담 열기 →</small>
          </span>
        </button>
      )}
      <div
        className="regional-tools"
        role="toolbar"
        aria-label="지역 지도 조작"
      >
        <button
          type="button"
          aria-label="지역 지도 확대"
          onClick={() => act("in")}
        >
          ＋
        </button>
        <button
          type="button"
          aria-label="지역 지도 축소"
          onClick={() => act("out")}
        >
          −
        </button>
        <button type="button" onClick={() => act("top")}>
          위에서 보기
        </button>
        <button type="button" onClick={() => act("reset")}>
          축제 위치로
        </button>
        <span>좌클릭 이동 · 휠 클릭 회전 · 휠로 확대</span>
      </div>
      {status && (
        <p className="regional-status" role="status">
          {status}
        </p>
      )}
      <p className="regional-credit">
        © OpenStreetMap 기여자 · 건물 높이 일부 추정 · 부스·무대·사람·차량은
        연출
      </p>
    </section>
  );
}
