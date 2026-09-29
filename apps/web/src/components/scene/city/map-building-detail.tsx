// 같은 전국 지도 카메라를 따라 확대 지점의 건물만 실제 축척으로 불러온다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { OrbitControls } from "three-stdlib";
import { projectKorea, unprojectKorea } from "../projection";
import type { SceneQuality } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import { loadCityTiles, type VenueTiles } from "../venue/tiles";
import { CityLabels } from "./city-labels";
import { GrayCityBuildings } from "./gray-city-buildings";
import { MapDetailGround } from "./map-detail-ground";
import "./city.css";

type Detail = { center: [number, number]; tiles: VenueTiles };
const cache = new Map<string, Detail>();

export function MapBuildingDetail({
  quality,
  night,
  festival,
  onCloseChange,
  onStatus,
}: {
  quality: SceneQuality;
  night: boolean;
  festival: FestivalSummary | null;
  onCloseChange: (close: boolean) => void;
  onStatus: (status: string | null) => void;
}) {
  const controls = useThree((state) => state.controls) as OrbitControls | null;
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const observed = useRef<string>("");
  const close = useRef(false);

  // 지도를 나갈 때 진단 상태를 정리해 이전 지역 정보가 남지 않게 한다.
  useEffect(
    () => () => {
      delete document.documentElement.dataset.cityBuildings;
      delete document.documentElement.dataset.cityCenter;
    },
    [],
  );

  // 카메라는 건드리지 않고 일정 거리 이상 이동했을 때만 주변 자료를 교체한다.
  useFrame(({ camera }) => {
    if (!controls) return;
    const distance = camera.position.distanceTo(controls.target);
    const near = distance < 8;
    if (near !== close.current) {
      close.current = near;
      onCloseChange(near);
    }
    const point = near
      ? unprojectKorea(controls.target.x, controls.target.z)
      : null;
    const snapped = point?.map((value) => Math.round(value * 200) / 200) as
      | [number, number]
      | undefined;
    const key = snapped?.join(",") ?? "";
    if (key === observed.current) return;
    observed.current = key;
    setFocus(snapped ?? null);
  });

  // 이동 중에는 요청을 모으고 최근 네 구역만 보관하며 이전 요청을 취소한다.
  useEffect(() => {
    if (!focus) {
      setDetail(null);
      onStatus(null);
      delete document.documentElement.dataset.cityBuildings;
      delete document.documentElement.dataset.cityCenter;
      return;
    }
    const controller = new AbortController();
    const key = focus.join(",");
    const show = (value: Detail) => {
      setDetail(value);
      onStatus(
        value.tiles.buildings.length
          ? null
          : "이 구역은 공개지도 건물 자료가 없어요.",
      );
      document.documentElement.dataset.cityBuildings = String(
        value.tiles.buildings.length,
      );
      document.documentElement.dataset.cityCenter = value.center.join(",");
    };
    const cached = cache.get(key);
    if (cached) {
      show(cached);
      return;
    }
    onStatus("주변 건물을 불러오는 중이에요.");
    const timer = window.setTimeout(() => {
      loadCityTiles(focus, controller.signal)
        .then((tiles) => {
          if (controller.signal.aborted) return;
          const value = { center: focus, tiles };
          cache.set(key, value);
          if (cache.size > 4) cache.delete(cache.keys().next().value as string);
          show(value);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            onStatus(
              "건물 자료를 불러오지 못했어요. 지도는 계속 이동할 수 있어요.",
            );
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [focus, onStatus]);

  // 지면과 건물은 동일한 전국 좌표를 쓰며 미터 자료만 킬로미터 축척으로 변환한다.
  const position = detail ? projectKorea(...detail.center) : null;
  const eventPoint = festival ? projectKorea(festival.lng, festival.lat) : null;
  return (
    <>
      {focus && detail && position && (
        <group
          position={[position[0], LAND_SURFACE_Y + 0.002, position[1]]}
          scale={0.001}
        >
          <MapDetailGround tiles={detail.tiles} />
          <GrayCityBuildings
            buildings={detail.tiles.buildings}
            quality={quality}
            night={night}
          />
        </group>
      )}
      {focus && festival && eventPoint && (
        <group
          position={[eventPoint[0], LAND_SURFACE_Y + 0.002, eventPoint[1]]}
          scale={0.001}
        >
          <CityLabels festival={festival} stations={[]} />
        </group>
      )}
    </>
  );
}
