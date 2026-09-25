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
  observePanelBounds,
  type PanelBounds,
} from "../../components/scene/scene-panel-bounds";
import { useSelectionStore } from "../../lib/selection-store";
import {
  FESTIVAL_CLUSTERS,
  FESTIVAL_POINTS,
  FESTIVAL_SOURCE,
  festivalGeoJson,
  KOREA_BOUNDS,
  mapStyle,
} from "./map-style";
import "../../styles/map-2d.css";

let protocolRegistered = false;

// 한 페이지에서 지도를 다시 열어도 같은 PMTiles 프로토콜을 중복 등록하지 않는다.
function registerTiles() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

// 패널 경계 캐시의 빈 영역에 전국 지도를 맞춘다.
function mapPadding(bounds: PanelBounds) {
  const safe = largestClearRect(bounds);
  const margin = 24;
  return {
    left: Math.max(0, safe.left + margin),
    right: Math.max(0, bounds.width - safe.right + margin),
    top: Math.max(0, safe.top + margin),
    bottom: Math.max(0, bounds.height - safe.bottom + margin),
  };
}

// MapLibre가 만든 팝업에는 텍스트 노드만 넣어 행사명을 안전하게 표시한다.
function festivalPopup(festival: FestivalSummary) {
  const labels = ["✓ 소규모", "! 수립 권고", "▲ 수립 대상", "◆ 대규모"];
  const element = document.createElement("div");
  element.className = "map-2d__popup";
  const name = document.createElement("strong");
  name.textContent = festival.name;
  const level = document.createElement("span");
  level.textContent = `${festival.level}등급 · ${labels[festival.level - 1] ?? labels[3]}`;
  element.append(name, level);
  return element;
}

// 지도 동작과 목록·요약이 같은 행사 ID를 읽고 쓴다.
export function MapLibreMap({
  festivals,
  overviewRevision,
}: {
  festivals: FestivalSummary[];
  overviewRevision: number;
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
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const selectSigungu = useSelectionStore((state) => state.selectSigungu);
  festivalsRef.current = festivals;
  selectedRef.current = selectedId;

  // 지도를 한 번 만들고, 패널 관찰자와 MapLibre 자원을 함께 해제한다.
  useEffect(() => {
    const container = containerRef.current;
    const stage = container?.closest<HTMLElement>(".scene-stage");
    if (!container || !stage) return;
    registerTiles();
    const initialTheme =
      document.documentElement.dataset.theme === "night" ? "night" : "day";
    let renderedTheme = initialTheme;
    const map = new MapLibre({
      container,
      style: mapStyle(initialTheme, festivalsRef.current),
      center: [127.5, 36.1],
      zoom: 5,
      minZoom: 4,
      maxZoom: 13,
      attributionControl: false,
      localIdeographFontFamily: '"Pretendard Variable", Pretendard, sans-serif',
    });
    mapRef.current = map;
    map.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

    // 지도가 준비되면 안전 영역에 전국을 맞추고 점 선택을 열어 둔다.
    map.on("load", () => {
      setReady(true);
      setError(false);
      if (boundsRef.current) {
        map.fitBounds(KOREA_BOUNDS, {
          padding: mapPadding(boundsRef.current),
          maxZoom: 7,
          animate: false,
        });
      }
    });
    map.on("style.load", () => {
      const source = map.getSource(FESTIVAL_SOURCE) as
        | GeoJSONSource
        | undefined;
      source?.setData(festivalGeoJson(festivalsRef.current));
      if (map.getLayer("festival-selected")) {
        map.setFilter("festival-selected", [
          "==",
          ["get", "eventId"],
          selectedRef.current ?? "",
        ]);
      }
    });
    map.on("error", () => {
      if (!map.isStyleLoaded()) setError(true);
    });
    map.on("zoom", () => setOverzoom(map.getZoom() >= 12.9));
    map.on("click", FESTIVAL_POINTS, (event) => {
      const id = event.features?.[0]?.properties?.eventId;
      const festival = festivalsRef.current.find((item) => item.eventId === id);
      if (!festival) return;
      selectFestival(festival.eventId);
      selectSigungu(festival.sigunguCode);
    });
    map.on("click", FESTIVAL_CLUSTERS, (event) => {
      const clusterId = event.features?.[0]?.properties?.cluster_id;
      const coordinates = event.features?.[0]?.geometry;
      const source = map.getSource(FESTIVAL_SOURCE) as
        | GeoJSONSource
        | undefined;
      if (clusterId == null || coordinates?.type !== "Point" || !source) return;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        if (zoom > 13) {
          const count = event.features?.[0]?.properties?.point_count;
          const note = document.createElement("p");
          note.className = "map-2d__popup";
          note.textContent = `겹친 행사 ${count}건 · 목록에서 선택해 주세요.`;
          popupRef.current?.remove();
          popupRef.current = new Popup({ closeButton: true })
            .setLngLat(coordinates.coordinates as [number, number])
            .setDOMContent(note)
            .addTo(map);
          return;
        }
        map.easeTo({
          center: coordinates.coordinates as [number, number],
          zoom,
        });
      });
    });
    for (const layer of [FESTIVAL_POINTS, FESTIVAL_CLUSTERS]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    // 3D 카메라와 같은 경계 캐시를 써서 크기 변화에도 패널을 피한다.
    const unobserve = observePanelBounds(stage, (bounds) => {
      boundsRef.current = bounds;
      map.resize();
      if (map.loaded() && !selectedRef.current) {
        map.fitBounds(KOREA_BOUNDS, {
          padding: mapPadding(bounds),
          maxZoom: 7,
          animate: false,
        });
      }
    });
    const themeObserver = new MutationObserver(() => {
      const theme =
        document.documentElement.dataset.theme === "night" ? "night" : "day";
      if (theme === renderedTheme) return;
      renderedTheme = theme;
      map.setStyle(mapStyle(theme, festivalsRef.current));
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      themeObserver.disconnect();
      unobserve();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [selectFestival, selectSigungu]);

  // 필터 결과가 바뀌면 지도 소스의 행사 점도 같은 목록으로 바꾼다.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(FESTIVAL_SOURCE) as GeoJSONSource | undefined;
    source?.setData(festivalGeoJson(festivals));
  }, [festivals]);

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
      zoom: Math.max(map.getZoom(), 13),
      offset,
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
    map.fitBounds(KOREA_BOUNDS, { padding: mapPadding(bounds), maxZoom: 7 });
  }, [overviewRevision, ready]);

  return (
    <section className="map-2d" aria-label="대한민국 행사 2D 지도">
      <div ref={containerRef} className="map-2d__canvas" />
      {!ready && !error && (
        <p className="map-2d__status" role="status">
          로컬 지도를 불러오는 중이에요.
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
        <p className="map-2d__overzoom">로컬 타일은 13단계까지 제공해요.</p>
      )}
    </section>
  );
}
