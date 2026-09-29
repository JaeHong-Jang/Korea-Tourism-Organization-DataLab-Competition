// 실제 지도 계산은 작업 스레드에 맡기고 완료된 형상만 GPU에 연결한다.
import { useEffect, useMemo, useRef, useState } from "react";
import type { FestivalSummary } from '@crowdcast/contracts/types';
import { DoubleSide, EqualStencilFunc, MeshLambertMaterial } from "three";
import type { LandModel } from "../land-tiles";
import type { SceneQuality } from "../quality";
import { unpackGeometry } from "./geometry-transfer";
import { CityActivity } from './activity/city-activity';
import { viewportTiles } from "./tile-plan";
import type { MapPoint, MapStatus, MapViewport } from "./types";
import { useMapWorker } from "./use-map-worker";
import type { MapWorkerResult } from "./worker-protocol";

type Ready = Extract<MapWorkerResult, { kind: "ready" }>;

// 이동하는 동안 이전 지도를 유지하고 정지 후 한 번만 최신 상세 범위를 계산한다.
export function NationalMapLayer({
  view,
  model,
  quality,
  onStatus,
  selected,
  reducedMotion,
  navigating,
  onGroundReady,
  festival,
}: {
  view: MapViewport | null;
  model: LandModel;
  quality: SceneQuality;
  onStatus: (status: MapStatus) => void;
  selected: MapPoint | null;
  count: number;
  reducedMotion: boolean;
  navigating: boolean;
  onGroundReady?: (ready: boolean) => void;
  festival?: FestivalSummary;
}) {
  const [loaded, setLoaded] = useState<Ready | null>(null);
  const currentView = useRef(view);
  currentView.current = view;
  const requestKey = view
    ? `${view.zoom}:${viewportTiles(view)
        .map(([x, y]) => `${x}/${y}`)
        .sort()
        .join(",")}`
    : "";
  const { client, error } = useMapWorker(model);
  useEffect(() => {
    const request = currentView.current;
    if (!request || !requestKey || navigating) return;
    if (error) {
      onStatus({
        state: "error",
        zoom: request.zoom,
        buildings: 0,
        roads: 0,
        missing: 0,
      });
      return;
    }
    if (!client) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      onStatus({
        state: "loading",
        zoom: request.zoom,
        buildings: 0,
        roads: 0,
        missing: 0,
      });
      client
        .load(request, quality, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          setLoaded(data);
          onStatus(data.status);
          document.documentElement.dataset.nationalMapZoom = String(
            request.zoom,
          );
          document.documentElement.dataset.nationalMapBuildings = String(
            data.status.buildings,
          );
        })
        .catch(() => {
          if (!controller.signal.aborted)
            onStatus({
              state: "error",
              zoom: request.zoom,
              buildings: 0,
              roads: 0,
              missing: 0,
            });
        });
    }, 240);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, client, error, quality, navigating, onStatus]);

  // 버퍼를 복사하거나 건물 외곽을 재계산하지 않고 Worker 결과를 연결한다.
  const geometry = useMemo(
    () =>
      loaded
        ? {
            buildings: unpackGeometry(loaded.buildings),
            ground: unpackGeometry(loaded.ground ?? null),
            surfaces: unpackGeometry(loaded.surfaces),
            roads: unpackGeometry(loaded.roads),
          }
        : null,
    [loaded],
  );

  // 지표끼리 깊이를 덮어쓰지 않고 순서대로 합성해 중첩 면의 깜빡임을 막는다.
  const material = useMemo(
    () =>
      new MeshLambertMaterial({
        vertexColors: true,
        side: DoubleSide,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: EqualStencilFunc,
        depthWrite: false,
        // 지면과 같은 고도를 쓰는 지도 색면은 정밀도 차이에 가려지지 않도록 지면 위에 합성한다.
        depthTest: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  );
  const buildingMaterial = useMemo(
    () => new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }),
    [],
  );
  useEffect(() => { onGroundReady?.(Boolean(geometry?.ground)); return () => onGroundReady?.(false); }, [geometry, onGroundReady]);
  useEffect(
    () => () => {
      geometry?.buildings?.dispose();
      geometry?.ground?.dispose();
      geometry?.surfaces?.dispose();
      geometry?.roads?.dispose();
    },
    [geometry],
  );
  useEffect(
    () => () => {
      material.dispose();
      buildingMaterial.dispose();
    },
    [material, buildingMaterial],
  );
  useEffect(
    () => () => {
      delete document.documentElement.dataset.nationalMapZoom;
      delete document.documentElement.dataset.nationalMapBuildings;
    },
    [],
  );
  if (!geometry) return null;
  return (
    <group name="national-source-map" dispose={null}>
      {geometry.ground && <mesh geometry={geometry.ground} material={buildingMaterial} renderOrder={1} />}
      {geometry.surfaces && (
        <mesh
          geometry={geometry.surfaces}
          material={material}
          renderOrder={2}
        />
      )}
      {geometry.roads && (
        <mesh geometry={geometry.roads} material={material} renderOrder={3} />
      )}
      {geometry.buildings && (
        <mesh
          geometry={geometry.buildings}
          material={buildingMaterial}
          renderOrder={4}
        />
      )}
      {view && <CityActivity data={loaded?.activity} view={view} model={model} quality={quality} reduced={reducedMotion} selected={selected} festival={festival}/>}
    </group>
  );
}
