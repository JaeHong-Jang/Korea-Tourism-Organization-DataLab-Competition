// 기존 공항 연결 연출과 항로를 재사용하되 선박 경로는 실제 국토와 충돌하지 않는 구간만 남긴다.
import { airways, seaways } from "../../motion/national-network";
import type { LandModel } from "../../land-tiles";
import { countryContains } from "../country-boundary";
import type { MapRoad } from "../types";
import { buildNetwork } from "./network";

// 긴 노선은 짧은 연결 구간으로 나눠 화면 중간을 지나는 운송수단도 활성화한다.
export function transportNetworks(model: LandModel) {
  const land = countryContains(model);
  const make = (air: boolean) => {
    const roads: MapRoad[] = [];
    for (const route of air ? airways : seaways)
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1],
          b = route.points[i],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.ceil(length / (air ? 0.8 : 0.1));
        for (let j = 0; j < steps; j++) {
          const p: [number, number] = [
              a[0] + ((b[0] - a[0]) * j) / steps,
              a[1] + ((b[1] - a[1]) * j) / steps,
            ],
            q: [number, number] = [
              a[0] + ((b[0] - a[0]) * (j + 1)) / steps,
              a[1] + ((b[1] - a[1]) * (j + 1)) / steps,
            ];
          if (
            !air &&
            [0, 0.25, 0.5, 0.75, 1].some((t) =>
              land([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]),
            )
          )
            continue;
          roads.push({
            kind: "rail",
            width: 0.005,
            name: route.name,
            points: [p, q],
          });
        }
      }
    return buildNetwork(
      { roads, buildings: [], areas: [], places: [] },
      "rail",
    );
  };
  return { air: make(true), sea: make(false) };
}
