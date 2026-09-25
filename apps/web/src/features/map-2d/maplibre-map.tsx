// 로컬 PMTiles 지도에 필터된 행사 점과 공유 선택 상태를 표시한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import {
  AttributionControl,
  addProtocol,
  type GeoJSONSource,
  Map as MapLibre,
  NavigationControl,
  Popup,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibre-worker";
import { Protocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";
import { largestClearRect } from "../../components/scene/camera-framing";
import {
  qualityDpr,
  recommendedQuality,
  type SceneQuality,
} from "../../components/scene/quality";
import type { PanelBounds } from "../../components/scene/scene-panel-bounds";
import { useSelectionStore } from "../../lib/selection-store";
import { festivalColumns, festivalRings } from "../map-3d/festival-geometry";
import { festivalPopup } from "../map-3d/festival-popup";
import { addTraffic, installMapEvents } from "../map-3d/map-events";
import type { TrafficLayer } from "../map-3d/traffic-layer";
import { cameraMotion, mapPadding } from "./map-camera";
import {
  FESTIVAL_SOURCE,
  festivalGeoJson,
  KOREA_BOUNDS,
  mapStyle,
} from "./map-style";
import "../../styles/map-2d.css";
import "../../styles/map-3d.css";

let protocolRegistered = false;

// 한 페이지에서 지도를 다시 열어도 같은 PMTiles 프로토콜을 중복 등록하지 않는다.
function registerTiles() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

// 지도 동작과 목록·요약이 같은 행사 ID를 읽고 쓴다.
export function MapLibreMap({
  festivals,
  overviewRevision,
  mode = "3d",
}: {
  festivals: FestivalSummary[];
  overviewRevision: number;
  mode?: "3d" | "top";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const festivalsRef = useRef(festivals);
  const boundsRef = useRef<PanelBounds | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [overzoom, setOverzoom] = useState(false);
  const trafficRef = useRef<TrafficLayer | null>(null);
  const quality = useRef<SceneQuality>(
    (() => {
      const requested = new URLSearchParams(window.location.search).get(
        "mapQuality",
      );
      return requested === "high" ||
        requested === "medium" ||
        requested === "low"
        ? requested
        : recommendedQuality(
            navigator.hardwareConcurrency,
            (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
          );
    })(),
  );
  const modeRef = useRef(mode);
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const selectSigungu = useSelectionStore((state) => state.selectSigungu);
  festivalsRef.current = festivals;
  selectedRef.current = selectedId;
  modeRef.current = mode;

  // 지도를 한 번 만들고, 패널 관찰자와 MapLibre 자원을 함께 해제한다.
  useEffect(() => {
    const container = containerRef.current;
    const stage = container?.closest<HTMLElement>(".scene-stage");
    if (!container || !stage) return;
    registerTiles();
    const initialTheme =
      document.documentElement.dataset.theme === "night" ? "night" : "day";
    const map = new MapLibre({
      container,
      style: mapStyle(initialTheme, festivalsRef.current),
      center: [127.5, 36.1],
      zoom: 5,
      minZoom: 4,
      maxZoom: 17,
      maxPitch: 70,
      pitch: modeRef.current === "3d" ? 55 : 0,
      pixelRatio: Math.min(
        window.devicePixelRatio,
        qualityDpr(quality.current),
      ),
      attributionControl: false,
      localIdeographFontFamily: '"Pretendard Variable", Pretendard, sans-serif',
    });
    mapRef.current = map;
    (window as Window & { __crowdcastMap?: MapLibre }).__crowdcastMap = map;
    map.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

    // 지도 이벤트·패널·테마 관찰은 지도 수명에 맞춰 함께 해제한다.
    const stopEvents = installMapEvents({
      map,
      stage,
      festivals: festivalsRef,
      bounds: boundsRef,
      selected: selectedRef,
      popup: popupRef,
      traffic: trafficRef,
      mode: modeRef,
      quality: quality.current,
      onReady: setReady,
      onError: setError,
      onOverzoom: setOverzoom,
      selectFestival,
      selectSigungu,
    });
    return () => {
      stopEvents();
      popupRef.current?.remove();
      map.remove();
      delete (window as Window & { __crowdcastMap?: MapLibre }).__crowdcastMap;
      trafficRef.current = null;
      mapRef.current = null;
    };
  }, [selectFestival, selectSigungu]);

  // 필터 결과가 바뀌면 지도 소스의 행사 점도 같은 목록으로 바꾼다.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(FESTIVAL_SOURCE) as GeoJSONSource | undefined;
    source?.setData(festivalGeoJson(festivals));
    (map?.getSource("festival-areas") as GeoJSONSource | undefined)?.setData(
      festivalColumns(festivals),
    );
    (map?.getSource("festival-ring") as GeoJSONSource | undefined)?.setData(
      festivalRings(festivals, selectedRef.current),
    );
  }, [festivals]);

  // 위에서 보기 토글은 같은 지도와 카메라 중심을 유지하며 기울기만 바꾼다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: mode === "3d" ? 55 : 0, ...cameraMotion() });
    if (mode === "top" && map.getLayer("map-traffic")) {
      map.removeLayer("map-traffic");
      trafficRef.current = null;
    } else if (
      mode === "3d" &&
      map.isStyleLoaded() &&
      !map.getLayer("map-traffic") &&
      quality.current !== "low"
    ) {
      trafficRef.current = addTraffic(map, quality.current);
    }
  }, [mode]);

  // 목록·지도에서 선택한 점으로 이동하고 색 외에 등급 글자를 표시한다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer("festival-selected")) {
      map.setFilter("festival-selected", [
        "==",
        ["get", "eventId"],
        selectedId ?? "",
      ]);
    }
    (map.getSource("festival-ring") as GeoJSONSource | undefined)?.setData(
      festivalRings(festivals, selectedId),
    );
    popupRef.current?.remove();
    if (!selectedId) return;
    const festival = festivals.find((item) => item.eventId === selectedId);
    if (!festival) return;
    const bounds = boundsRef.current;
    const safe = bounds ? largestClearRect(bounds) : null;
    const offset: [number, number] =
      safe && bounds
        ? [
            (safe.left + safe.right - bounds.width) / 2,
            (safe.top + safe.bottom - bounds.height) / 2,
          ]
        : [0, 0];
    map.easeTo({
      center: [festival.lng, festival.lat],
      zoom: 15,
      pitch: modeRef.current === "3d" ? 60 : 0,
      offset,
      ...cameraMotion(),
    });
    popupRef.current = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 18,
    })
      .setLngLat([festival.lng, festival.lat])
      .setDOMContent(festivalPopup(festival))
      .addTo(map);
  }, [selectedId, festivals, ready]);

  // 전국 보기 버튼은 현재 필터를 유지하고 패널 밖 영역으로 돌아간다.
  useEffect(() => {
    const map = mapRef.current;
    const bounds = boundsRef.current;
    if (!map || !bounds || !ready || overviewRevision === 0) return;
    map.fitBounds(KOREA_BOUNDS, {
      padding: mapPadding(bounds),
      maxZoom: 7,
      ...cameraMotion(),
    });
  }, [overviewRevision, ready]);

  return (
    <section
      className="map-2d"
      aria-label={
        mode === "3d"
          ? "대한민국 행사 3D 지도"
          : "대한민국 행사 위에서 보기 지도"
      }
      data-map-mode={mode}
    >
      <div ref={containerRef} className="map-2d__canvas" />
      {!ready && !error && (
        <p className="map-2d__status" role="status">
          지도를 불러오고 있어요.
        </p>
      )}
      {error && (
        <p className="map-2d__status" role="alert">
          지도를 불러오지 못했어요. 행사 목록에서 선택해 주세요.
        </p>
      )}
      {ready && (
        <p className="map-2d__hint">
          방향키로 이동하고 +/−로 확대할 수 있어요. 행사 선택은 목록에서도
          가능해요.
        </p>
      )}
      {overzoom && (
        <p className="map-2d__overzoom">
          더 확대할 수 없어요. 행사 목록에서 자세히 보세요.
        </p>
      )}
      <p className="map-2d__honest">
        건물·도로 = OpenStreetMap · 차량 움직임은 연출 · 인원 규모는 예보값 비례
      </p>
    </section>
  );
}
