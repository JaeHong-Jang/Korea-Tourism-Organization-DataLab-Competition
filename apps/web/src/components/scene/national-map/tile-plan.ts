// 화면 범위에 맞는 상세 단계와 요청 상한을 정해 전국 건물을 한 번에 읽지 않는다.
import type { MapPoint, MapViewport } from "./types";

export const MAX_MAP_TILES = 36;
export const MAP_BOUNDS = [124.5, 33, 131, 38.7] as const;

// 폭에 따라 한 화면에 약 세 개 타일이 들어오는 OSM 단계로 맞춘다.
export function mapZoom(widthKm: number, latitude: number): number {
  const width = Math.max(0.1, widthKm);
  return Math.max(
    7,
    Math.min(
      15,
      Math.floor(
        Math.log2((40075 * Math.cos((latitude * Math.PI) / 180) * 3) / width),
      ),
    ),
  );
}

// 지도 경위도를 해당 단계의 타일 좌표로 변환한다.
export function mapTileAt(lng: number, lat: number, zoom: number): MapPoint {
  const n = 2 ** zoom;
  const angle = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return [
    ((lng + 180) / 360) * n,
    ((1 - Math.asinh(Math.tan(angle)) / Math.PI) / 2) * n,
  ];
}

// 저장된 지도 범위만 요청하고 화면이 비스듬해도 가까운 타일부터 상한 안에 읽는다.
export function viewportTiles(view: MapViewport): MapPoint[] {
  const [west, south, east, north] = view.bounds;
  const minLng = Math.max(MAP_BOUNDS[0], west),
    maxLng = Math.min(MAP_BOUNDS[2], east);
  const minLat = Math.max(MAP_BOUNDS[1], south),
    maxLat = Math.min(MAP_BOUNDS[3], north);
  if (minLng > maxLng || minLat > maxLat) return [];
  const [left, top] = mapTileAt(minLng, maxLat, view.zoom);
  const [right, bottom] = mapTileAt(maxLng, minLat, view.zoom);
  const center = mapTileAt(...view.center, view.zoom);
  const tiles: MapPoint[] = [];
  const cx = Math.max(
    Math.floor(left),
    Math.min(Math.floor(right), Math.floor(center[0])),
  );
  const cy = Math.max(
    Math.floor(top),
    Math.min(Math.floor(bottom), Math.floor(center[1])),
  );
  const radius = Math.ceil(Math.sqrt(MAX_MAP_TILES));
  for (
    let x = Math.max(Math.floor(left), cx - radius);
    x <= Math.min(Math.floor(right), cx + radius);
    x++
  )
    for (
      let y = Math.max(Math.floor(top), cy - radius);
      y <= Math.min(Math.floor(bottom), cy + radius);
      y++
    )
      tiles.push([x, y]);
  return tiles
    .sort(
      (a, b) =>
        Math.hypot(a[0] - center[0], a[1] - center[1]) -
        Math.hypot(b[0] - center[0], b[1] - center[1]),
    )
    .slice(0, MAX_MAP_TILES);
}
