// 행사 예보 규모와 타일 경로에 따라 도시 생활 배우를 결정적으로 배분한다.
import type { TrafficRoute } from "./traffic-routes";
import { peopleCap, vehicleCap } from "./traffic-routes";

export type Quality = "high" | "medium" | "low";
export type FestivalFocus = {
  lng: number;
  lat: number;
  peakP50: number;
  selected?: boolean;
};
export type CityActor = {
  route: TrafficRoute | null;
  speed: number;
  phase: number;
  kind: "person" | "car" | "taxi" | "bus" | "train";
  gathering: boolean;
};
const fraction = (value: number) => value - Math.floor(value);

// 순간 최대 추정치가 클수록 행사장 주위와 진입 도로에 더 많은 인형을 둔다.
export function festivalShare(peakP50: number, selected = false): number {
  return Math.min(
    0.65,
    (selected ? 0.18 : 0.06) +
      Math.max(0, peakP50) / (selected ? 40_000 : 80_000),
  );
}

// 같은 타일과 행사에는 같은 위치를 써 카메라 이동 때 배우가 불규칙하게 튀지 않게 한다.
export function cityActorPlan(
  routes: TrafficRoute[],
  quality: Quality,
  festival: FestivalFocus | null,
): CityActor[] {
  const roads = routes.filter((route) => route.kind === "road");
  const rails = routes.filter((route) => route.kind === "rail");
  const walks = routes.filter((route) => route.kind === "walk");
  const actors: CityActor[] = [];
  const vehicles = roads.length ? vehicleCap(quality) : 0;
  for (let index = 0; index < vehicles; index++) {
    const rail = rails.length > 0 && index % 15 === 0;
    const route = rail
      ? rails[index % rails.length]
      : roads[index % roads.length];
    actors.push({
      route,
      speed: rail ? 17 : index % 11 === 0 ? 9 : 13,
      phase: fraction(index * 0.61803398875) * route.length,
      kind: rail
        ? "train"
        : index % 11 === 0
          ? "bus"
          : index % 7 === 0
            ? "taxi"
            : "car",
      gathering: false,
    });
  }
  if (!walks.length) return actors;
  const near = festival
    ? walks.filter((route) =>
        route.points.some(([x, y]) => {
          const lng = x * 360 - 180;
          const lat =
            (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
          return (
            Math.hypot(
              (lng - festival.lng) * Math.cos((festival.lat * Math.PI) / 180),
              lat - festival.lat,
            ) < 0.004
          );
        }),
      )
    : [];
  const share = festival
    ? festivalShare(festival.peakP50, festival.selected)
    : 0;
  const count = peopleCap(quality);
  for (let index = 0; index < count; index++) {
    const gathering = near.length > 0 && index < Math.round(count * share);
    const choices = gathering ? near : walks;
    const route = choices[index % choices.length];
    actors.push({
      route,
      speed: 0.9 + fraction(index * 0.41421356237) * 0.7,
      phase: fraction(index * 0.754877666) * route.length,
      kind: "person",
      gathering,
    });
  }
  return actors;
}
