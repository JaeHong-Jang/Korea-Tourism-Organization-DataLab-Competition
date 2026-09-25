// 행사 카드를 우선 배치하고 화면에 드문드문 주요 장소만 표시한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { type Map as MapLibre, Marker } from "maplibre-gl";

type CardArea = { x: number; y: number; width: number; height: number };
const PLACE_KINDS = new Set([
  "station",
  "railway_station",
  "park",
  "castle",
  "monument",
  "attraction",
]);

// 화면 좌표로 카드의 자리를 예약해 행사와 겹치는 장소를 숨긴다.
function reserveCard(
  map: MapLibre,
  coordinates: [number, number],
  width: number,
  height: number,
  occupied: CardArea[],
): boolean {
  const { x, y } = map.project(coordinates);
  if (
    occupied.some(
      (card) =>
        Math.abs(card.x - x) < (card.width + width) / 2 + 8 &&
        Math.abs(card.y - y) < (card.height + height) / 2 + 8,
    )
  )
    return false;
  occupied.push({ x, y, width, height });
  return true;
}

// 실제 대표 이미지는 동일 출처의 캐시 주소만 이름표에 붙인다.
function festivalCard(
  festival: FestivalSummary,
  choose: (id: string) => void,
): HTMLElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "map-3d-label";
  card.setAttribute("aria-label", `${festival.name} 선택`);
  if (festival.image) {
    const url = new URL(festival.image.url, window.location.origin);
    if (url.origin === window.location.origin) {
      const image = document.createElement("img");
      image.src = url.href;
      image.alt = "";
      card.append(image);
    }
  }
  const title = document.createElement("span");
  title.textContent = `${["✓", "!", "▲", "◆"][festival.level - 1] ?? "◆"} ${festival.name}`;
  card.append(title);
  card.addEventListener("click", (event) => {
    event.stopPropagation();
    choose(festival.eventId);
  });
  return card;
}

// 카메라 이동 뒤 화면에 들어온 카드만 만들고 이전 DOM은 즉시 해제한다.
export class MapLabels {
  private markers: Marker[] = [];
  constructor(
    private map: MapLibre,
    private choose: (id: string) => void,
  ) {}

  // 행사에 먼저 자리를 주고 중요한 역·공원·명소만 남긴다.
  update(festivals: FestivalSummary[], mode: "3d" | "top") {
    this.clear();
    if (mode !== "3d") return;
    const bounds = this.map.getBounds();
    const occupied: CardArea[] = [];
    let festivalCount = 0;
    for (const festival of festivals) {
      if (festivalCount >= 12) break;
      const coordinates: [number, number] = [festival.lng, festival.lat];
      if (
        !bounds.contains(coordinates) ||
        !reserveCard(this.map, coordinates, 190, 52, occupied)
      )
        continue;
      this.markers.push(
        new Marker({
          element: festivalCard(festival, this.choose),
          anchor: "bottom",
          offset: [0, -18],
        })
          .setLngLat(coordinates)
          .addTo(this.map),
      );
      festivalCount++;
    }
    if (this.map.getZoom() < 13) return;
    const names = new Set<string>();
    const places = this.map
      .querySourceFeatures("protomaps", { sourceLayer: "pois" })
      .filter(
        (feature) =>
          feature.geometry.type === "Point" &&
          PLACE_KINDS.has(feature.properties.kind) &&
          Number(feature.properties.min_zoom) <= 14 &&
          (feature.properties["name:ko"] || feature.properties.name),
      )
      .sort(
        (a, b) => Number(a.properties.min_zoom) - Number(b.properties.min_zoom),
      );
    let placeCount = 0;
    for (const feature of places) {
      if (placeCount >= 12) break;
      const name = String(
        feature.properties["name:ko"] ?? feature.properties.name,
      );
      if (names.has(name) || feature.geometry.type !== "Point") continue;
      const coordinates = feature.geometry.coordinates as [number, number];
      if (
        !bounds.contains(coordinates) ||
        !reserveCard(this.map, coordinates, 120, 36, occupied)
      )
        continue;
      names.add(name);
      const card = document.createElement("span");
      card.className = "map-3d-label map-3d-label--place";
      card.textContent = name;
      this.markers.push(
        new Marker({ element: card, anchor: "bottom" })
          .setLngLat(coordinates)
          .addTo(this.map),
      );
      placeCount++;
    }
  }

  // 지도 스타일 교체와 해제 때 카드 노드를 남기지 않는다.
  clear() {
    for (const marker of this.markers) marker.remove();
    this.markers = [];
  }
}
