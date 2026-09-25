// 로컬 Protomaps 도로·철도 선에서 화면 안 차량 연출 경로를 고른다.
import type { GeoJsonProperties, Geometry } from "geojson";
import { MercatorCoordinate } from "maplibre-gl";

export type TrafficKind = "road" | "rail";
export type TrafficRoute = {
  kind: TrafficKind;
  points: [number, number][];
  lengths: number[];
  length: number;
  meterScale: number;
};
export type RoadFeature = { geometry: Geometry; properties: GeoJsonProperties };

// 짧은 타일 조각과 보행로는 차량이 순간 이동하는 것처럼 보이므로 제외한다.
export function trafficRoutes(
  features: RoadFeature[],
  visible?: (lng: number, lat: number) => boolean,
): TrafficRoute[] {
  const routes: TrafficRoute[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const kind = feature.properties?.kind;
    if (kind !== "major_road" && kind !== "highway" && kind !== "rail")
      continue;
    const lines =
      feature.geometry.type === "LineString"
        ? [feature.geometry.coordinates]
        : feature.geometry.type === "MultiLineString"
          ? feature.geometry.coordinates
          : [];
    for (const line of lines) {
      if (
        line.length < 2 ||
        (visible && !line.some(([lng, lat]) => visible(lng, lat)))
      )
        continue;
      const key = `${kind}:${line[0].join(",")}:${line.at(-1)?.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const points = line.map(([lng, lat]) => {
        const point = MercatorCoordinate.fromLngLat([lng, lat]);
        return [point.x, point.y] as [number, number];
      });
      const lengths = [0];
      for (let index = 1; index < points.length; index++) {
        const [x, y] = points[index];
        const [previousX, previousY] = points[index - 1];
        lengths.push(
          lengths[index - 1] + Math.hypot(x - previousX, y - previousY),
        );
      }
      const length = lengths.at(-1) ?? 0;
      const meterScale = MercatorCoordinate.fromLngLat(
        line[0] as [number, number],
      ).meterInMercatorCoordinateUnits();
      if (length < meterScale * 30) continue;
      routes.push({
        kind: kind === "rail" ? "rail" : "road",
        points,
        lengths,
        length,
        meterScale,
      });
      if (routes.length >= 160) return routes;
    }
  }
  return routes;
}

// 누적 선분 길이로 같은 경로 위의 위치와 방향을 배열 할당 없이 구한다.
export function sampleRoute(
  route: TrafficRoute,
  distance: number,
  output: { x: number; y: number; heading: number },
) {
  const offset = distance % route.length;
  let index = 1;
  while (index < route.lengths.length - 1 && route.lengths[index] < offset)
    index++;
  const from = route.points[index - 1];
  const to = route.points[index];
  const span = route.lengths[index] - route.lengths[index - 1];
  const fraction = span ? (offset - route.lengths[index - 1]) / span : 0;
  output.x = from[0] + (to[0] - from[0]) * fraction;
  output.y = from[1] + (to[1] - from[1]) * fraction;
  output.heading = Math.atan2(to[1] - from[1], to[0] - from[0]);
  return output;
}

// 저사양과 움직임 감소 설정에서는 GPU 차량을 그리지 않는다.
export function vehicleCap(quality: "high" | "medium" | "low") {
  if (quality === "low") return 0;
  return quality === "high" ? 200 : 80;
}
