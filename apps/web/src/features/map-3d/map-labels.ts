// 화면 안 행사와 역·공원의 이름을 최대 30개의 작은 카드로 표시한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { type Map as MapLibre, Marker } from "maplibre-gl";

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

  // 행사를 우선 표시하고 남는 슬롯에 이름이 있는 역·공원을 둔다.
  update(festivals: FestivalSummary[], mode: "3d" | "top") {
    this.clear();
    if (mode !== "3d") return;
    const bounds = this.map.getBounds();
    const visible = festivals
      .filter((item) => bounds.contains([item.lng, item.lat]))
      .slice(0, 25);
    for (const festival of visible)
      this.markers.push(
        new Marker({
          element: festivalCard(festival, this.choose),
          anchor: "bottom",
          offset: [0, -18],
        })
          .setLngLat([festival.lng, festival.lat])
          .addTo(this.map),
      );
    if (this.map.getZoom() < 13 || this.markers.length >= 30) return;
    const names = new Set<string>();
    for (const feature of this.map.querySourceFeatures("protomaps", {
      sourceLayer: "pois",
    })) {
      if (this.markers.length >= 30) break;
      const name = feature.properties["name:ko"] ?? feature.properties.name;
      if (
        !name ||
        names.has(name) ||
        !["station", "park", "railway_station"].includes(
          feature.properties.kind,
        ) ||
        feature.geometry.type !== "Point"
      )
        continue;
      const coordinates = feature.geometry.coordinates as [number, number];
      if (!bounds.contains(coordinates)) continue;
      names.add(name);
      const card = document.createElement("span");
      card.className = "map-3d-label map-3d-label--place";
      card.textContent = name;
      this.markers.push(
        new Marker({ element: card, anchor: "bottom" })
          .setLngLat(coordinates)
          .addTo(this.map),
      );
    }
  }

  // 지도 스타일 교체와 해제 때 카드 노드를 남기지 않는다.
  clear() {
    for (const marker of this.markers) marker.remove();
    this.markers = [];
  }
}
