// z15 타일 좌표를 행사 중심의 동·북 미터 장면 좌표로 바꾼다.
export type Point = [number, number];
export const TILE_ZOOM = 15;
export const TILE_EXTENT = 4096;
const EARTH_RADIUS = 6378137;

// 지리 좌표를 인터넷 지도와 같은 Web Mercator 타일 번호로 바꾼다.
export function tileAt(lng: number, lat: number): Point {
  const n = 2 ** TILE_ZOOM;
  const latitude = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return [
    ((lng + 180) / 360) * n,
    ((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2) * n,
  ];
}

// 타일 내부 정수 좌표를 행사 중심의 동쪽 x·남쪽 z 미터로 옮긴다.
export function tilePointToVenue(
  point: Point,
  tileX: number,
  tileY: number,
  center: Point,
): Point {
  const n = 2 ** TILE_ZOOM;
  const lon = ((tileX + point[0] / TILE_EXTENT) / n) * Math.PI * 2 - Math.PI;
  const mercY = Math.PI - ((tileY + point[1] / TILE_EXTENT) / n) * Math.PI * 2;
  const centerLon = (center[0] * Math.PI) / 180;
  const centerLat = (center[1] * Math.PI) / 180;
  const centerY = Math.log(Math.tan(Math.PI / 4 + centerLat / 2));
  const scale = Math.cos(centerLat) * EARTH_RADIUS;
  return [(lon - centerLon) * scale, (centerY - mercY) * scale];
}

// 반경 1.2km와 교차하는 z15 타일만 요청한다.
export function nearbyTiles(lng: number, lat: number, radius = 1200): Point[] {
  const latDelta = radius / 111320;
  const lonDelta = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const [minX, minY] = tileAt(lng - lonDelta, lat + latDelta);
  const [maxX, maxY] = tileAt(lng + lonDelta, lat - latDelta);
  const tiles: Point[] = [];
  for (let x = Math.floor(minX); x <= Math.floor(maxX); x++)
    for (let y = Math.floor(minY); y <= Math.floor(maxY); y++)
      tiles.push([x, y]);
  return tiles;
}
