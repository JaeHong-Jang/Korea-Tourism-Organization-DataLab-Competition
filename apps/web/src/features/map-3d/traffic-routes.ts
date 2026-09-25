// 로컬 도로·철도 타일에서 화면 안 차량과 보행자의 연출 경로를 고른다.
import type { GeoJsonProperties, Geometry } from "geojson";
import { MercatorCoordinate } from "maplibre-gl";

export type TrafficKind = "road" | "rail" | "walk";
export type TrafficRoute = {
  kind: TrafficKind;
  points: [number, number][];
  lengths: number[];
  length: number;
  meterScale: number;
};
export type RoadFeature = { geometry: Geometry; properties: GeoJsonProperties };

// 타일 경계에 걸친 짧은 조각도 살려 실제 도로망 위에 배우를 놓는다.
export function trafficRoutes(
  features: RoadFeature[],
  visible?: (lng: number, lat: number) => boolean,
): TrafficRoute[] {
  const routes: TrafficRoute[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const kind = feature.properties?.kind;
    const isRoad = kind === "major_road" || kind === "highway";
    const isWalk = kind === "path" || kind === "minor_road" || isRoad;
    if (!isRoad && !isWalk && kind !== "rail") continue;
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
      if (length < meterScale * 12) continue;
      const route = {
        kind:
          kind === "rail"
            ? ("rail" as const)
            : isRoad
              ? ("road" as const)
              : ("walk" as const),
        points,
        lengths,
        length,
        meterScale,
      };
      routes.push(route);
      if (isRoad) routes.push({ ...route, kind: "walk" });
      if (routes.length >= 500) return routes;
    }
  }
  return routes;
}

// 누적 선분 길이로 위치와 방향을 매 프레임 새 배열 없이 구한다.
export function sampleRoute(
  route: TrafficRoute,
  distance: number,
  output: { x: number; y: number; heading: number },
) {
  const offset = ((distance % route.length) + route.length) % route.length;
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

// 표시 품질에 따라 차량·보행자 GPU 인스턴스 수를 제한한다.
export function vehicleCap(quality: "high" | "medium" | "low") {
  return quality === "high" ? 600 : quality === "medium" ? 250 : 0;
}
export function peopleCap(quality: "high" | "medium" | "low") {
  return quality === "high" ? 2500 : quality === "medium" ? 1000 : 0;
}
