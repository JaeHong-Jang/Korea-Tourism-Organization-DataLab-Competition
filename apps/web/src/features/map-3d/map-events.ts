// 지도 스타일·타일·차량·행사 클릭 이벤트를 한 지도 인스턴스에 묶는다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { type GeoJSONSource, type Map as MapLibre, Popup } from "maplibre-gl";
import type { SceneQuality } from "../../components/scene/quality";
import {
  observePanelBounds,
  type PanelBounds,
} from "../../components/scene/scene-panel-bounds";
import { cameraMotion, mapPadding } from "../map-2d/map-camera";
import {
  FESTIVAL_CLUSTERS,
  FESTIVAL_COLUMNS,
  FESTIVAL_POINTS,
  FESTIVAL_SOURCE,
  festivalGeoJson,
  KOREA_BOUNDS,
  mapStyle,
} from "../map-2d/map-style";
import { festivalColumns, festivalRings } from "./festival-geometry";
import { MapLabels } from "./map-labels";
import { TrafficLayer } from "./traffic-layer";
import { trafficRoutes } from "./traffic-routes";

type Ref<T> = { current: T };
type Options = {
  map: MapLibre;
  stage: HTMLElement;
  festivals: Ref<FestivalSummary[]>;
  bounds: Ref<PanelBounds | null>;
  selected: Ref<string | null>;
  popup: Ref<Popup | null>;
  traffic: Ref<TrafficLayer | null>;
  mode: Ref<"3d" | "top">;
  quality: SceneQuality;
  onReady: (value: boolean) => void;
  onError: (value: boolean) => void;
  onOverzoom: (value: boolean) => void;
  selectFestival: (id: string) => void;
  selectSigungu: (code: string) => void;
};

// 라벨 아래 차량 레이어를 두어 철도·도로 연출이 지명 글자를 가리지 않게 한다.
export function addTraffic(map: MapLibre, quality: SceneQuality): TrafficLayer {
  const traffic = new TrafficLayer(quality);
  map.addLayer(
    traffic,
    map.getStyle().layers.find((layer) => layer.type === "symbol")?.id,
  );
  traffic.setMotion(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    !document.hidden,
  );
  return traffic;
}

// 실제 지도 수명에 맞춰 리스너·관찰자를 설치하고 해제 함수를 돌려준다.
export function installMapEvents(options: Options): () => void {
  const {
    map,
    stage,
    festivals,
    bounds,
    selected,
    popup,
    traffic,
    mode,
    quality,
    onReady,
    onError,
    onOverzoom,
    selectFestival,
    selectSigungu,
  } = options;
  let renderedTheme =
    document.documentElement.dataset.theme === "night" ? "night" : "day";
  const labels = new MapLabels(map, (id) => {
    const festival = festivals.current.find((item) => item.eventId === id);
    if (!festival) return;
    selectFestival(id);
    selectSigungu(festival.sigunguCode);
  });
  let routeTimer: ReturnType<typeof setTimeout> | undefined;
  map.setMaxBounds(KOREA_BOUNDS);
  const honest = stage.querySelector<HTMLElement>(".map-2d__honest");
  const notice =
    "건물·도로 = OpenStreetMap · 사람·차량 움직임은 연출 · 인원 규모는 예보값 비례";
  if (honest) honest.textContent = notice;

  // 스타일 교체 뒤 하늘·차량·행사 소스를 현재 선택으로 복원한다.
  map.on("style.load", () => {
    const css = getComputedStyle(document.documentElement);
    map.setSky({
      "sky-color": css.getPropertyValue("--map-sky").trim(),
      "horizon-color": css.getPropertyValue("--map-horizon").trim(),
      "fog-color": css.getPropertyValue("--map-fog").trim(),
      "atmosphere-blend": 0.72,
    });
    if (mode.current === "3d" && quality !== "low")
      traffic.current = addTraffic(map, quality);
    labels.clear();
    (map.getSource(FESTIVAL_SOURCE) as GeoJSONSource | undefined)?.setData(
      festivalGeoJson(festivals.current),
    );
    (map.getSource("festival-areas") as GeoJSONSource | undefined)?.setData(
      festivalColumns(festivals.current),
    );
    (map.getSource("festival-ring") as GeoJSONSource | undefined)?.setData(
      festivalRings(festivals.current, selected.current),
    );
    if (map.getLayer("festival-selected"))
      map.setFilter("festival-selected", [
        "==",
        ["get", "eventId"],
        selected.current ?? "",
      ]);
  });

  // 첫 전국 카메라와 로딩·오류 상태를 화면에 전달한다.
  map.on("load", () => {
    if (mode.current === "3d") map.setPitch(28);
    onReady(true);
    onError(false);
    if (bounds.current)
      map.fitBounds(KOREA_BOUNDS, {
        padding: mapPadding(bounds.current),
        maxZoom: 7,
        animate: false,
      });
  });
  map.on("error", () => {
    if (!map.isStyleLoaded()) onError(true);
  });
  map.on("zoom", () => onOverzoom(map.getZoom() >= 16.9));

  // 보이는 로컬 타일의 주요 도로·철도만 차량 경로로 유지한다.
  const refreshTraffic = () => {
    labels.update(festivals.current, mode.current);
    if (!traffic.current) return;
    if (map.getZoom() < 14 || !map.isSourceLoaded("protomaps")) {
      traffic.current.setRoutes([]);
      if (honest) honest.textContent = notice;
      return;
    }
    const visible = map.getBounds();
    const routes = trafficRoutes(
      map.querySourceFeatures("protomaps", { sourceLayer: "roads" }),
      (lng, lat) => visible.contains([lng, lat]),
    );
    traffic.current.setRoutes(routes);
    const nearby = festivals.current.filter((festival) =>
      visible.contains([festival.lng, festival.lat]),
    );
    const center = map.getCenter();
    const focused =
      nearby.find((festival) => festival.eventId === selected.current) ??
      nearby.sort(
        (a, b) =>
          Math.hypot(a.lng - center.lng, a.lat - center.lat) -
          Math.hypot(b.lng - center.lng, b.lat - center.lat),
      )[0];
    traffic.current.setFestival(
      focused
        ? {
            lng: focused.lng,
            lat: focused.lat,
            peakP50: focused.peakP50,
            selected: focused.eventId === selected.current,
          }
        : null,
    );
    const dolls = Number(document.documentElement.dataset.mapGathering ?? 0);
    if (honest)
      honest.textContent =
        focused && dolls > 0
          ? `${notice} · 행사장 인형 1명 = ${Math.ceil(focused.peakP50 / dolls).toLocaleString("ko-KR")}명(추정)`
          : notice;
  };
  const scheduleTraffic = () => {
    clearTimeout(routeTimer);
    routeTimer = setTimeout(refreshTraffic, 120);
  };
  map.on("moveend", scheduleTraffic);
  map.on("moveend", () => {
    if (mode.current === "3d" && map.getZoom() < 8 && map.getPitch() > 30)
      map.setPitch(28);
  });
  map.on("sourcedata", (event) => {
    if (event.sourceId === "protomaps" && event.isSourceLoaded)
      scheduleTraffic();
  });
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onVisibility = () =>
    traffic.current?.setMotion(motionQuery.matches, !document.hidden);
  document.addEventListener("visibilitychange", onVisibility);
  motionQuery.addEventListener("change", onVisibility);

  // 기둥과 점은 같은 선택 스토어를 쓰며 밀집 점은 확대한다.
  const choose = (id: unknown) => {
    const festival = festivals.current.find((item) => item.eventId === id);
    if (!festival) return;
    selectFestival(festival.eventId);
    selectSigungu(festival.sigunguCode);
  };
  map.on("click", FESTIVAL_POINTS, (event) =>
    choose(event.features?.[0]?.properties?.eventId),
  );
  map.on("click", FESTIVAL_COLUMNS, (event) =>
    choose(event.features?.[0]?.properties?.eventId),
  );
  map.on("click", FESTIVAL_CLUSTERS, (event) => {
    const clusterId = event.features?.[0]?.properties?.cluster_id;
    const geometry = event.features?.[0]?.geometry;
    const source = map.getSource(FESTIVAL_SOURCE) as GeoJSONSource | undefined;
    if (clusterId == null || geometry?.type !== "Point" || !source) return;
    source.getClusterExpansionZoom(clusterId).then((zoom) => {
      if (zoom > 17) {
        const note = document.createElement("p");
        note.className = "map-2d__popup";
        note.textContent = `겹친 행사 ${event.features?.[0]?.properties?.point_count}건 · 목록에서 선택해 주세요.`;
        popup.current?.remove();
        popup.current = new Popup({ closeButton: true })
          .setLngLat(geometry.coordinates as [number, number])
          .setDOMContent(note)
          .addTo(map);
      } else
        map.easeTo({
          center: geometry.coordinates as [number, number],
          zoom,
          ...cameraMotion(),
        });
    });
  });
  for (const layer of [FESTIVAL_POINTS, FESTIVAL_CLUSTERS, FESTIVAL_COLUMNS]) {
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }

  // 패널과 테마가 달라지면 안전한 전국 프레임과 같은 타일 스타일을 유지한다.
  const unobserve = observePanelBounds(stage, (measured) => {
    bounds.current = measured;
    map.resize();
    if (map.loaded() && !selected.current)
      map.fitBounds(KOREA_BOUNDS, {
        padding: mapPadding(measured),
        maxZoom: 7,
        animate: false,
      });
  });
  const themeObserver = new MutationObserver(() => {
    const theme =
      document.documentElement.dataset.theme === "night" ? "night" : "day";
    if (theme === renderedTheme) return;
    renderedTheme = theme;
    map.setStyle(mapStyle(theme, festivals.current));
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => {
    clearTimeout(routeTimer);
    labels.clear();
    themeObserver.disconnect();
    unobserve();
    document.removeEventListener("visibilitychange", onVisibility);
    motionQuery.removeEventListener("change", onVisibility);
  };
}
