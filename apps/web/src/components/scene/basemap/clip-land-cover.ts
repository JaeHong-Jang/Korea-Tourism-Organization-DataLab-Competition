// 농지·숲·호수를 모든 남한 시군구 경계와 교차시켜 경계 밖의 조각을 제거한다.
import polygonClipping from "polygon-clipping";
import type { BaseArea, Basemap, Point2 } from "./national-basemap";

// 경계 상자로 후보를 좁혀 전국의 모든 섬과 매번 교차 계산하지 않는다.
function bounds(ring: Point2[]) {
  return ring.reduce(
    (box, [x, z]) => ({
      minX: Math.min(box.minX, x),
      maxX: Math.max(box.maxX, x),
      minZ: Math.min(box.minZ, z),
      maxZ: Math.max(box.maxZ, z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
}

// 폴리곤 교차 연산으로 해안선·도서·내부 구멍을 유지하고 양쪽 경계에 걸친 피복만 자른다.
export function clipLandCover(
  basemap: Pick<Basemap, "areas" | "water">,
  boundary: Point2[][][],
) {
  const land = boundary
    .filter((rings) => rings[0]?.length >= 4)
    .map((rings) => ({ rings, box: bounds(rings[0]) }));
  const clip = (areas: BaseArea[]): BaseArea[] =>
    areas.flatMap((area) => {
      if (!area.rings[0]?.length) return [];
      const box = bounds(area.rings[0]);
      const candidates = land.filter(
        ({ box: other }) =>
          box.minX <= other.maxX &&
          box.maxX >= other.minX &&
          box.minZ <= other.maxZ &&
          box.maxZ >= other.minZ,
      );
      if (!candidates.length) return [];
      return polygonClipping
        .intersection(
          area.rings,
          candidates.map(({ rings }) => rings),
        )
        .map((rings) => ({ kind: area.kind, rings }));
    });
  return { areas: clip(basemap.areas), water: clip(basemap.water) };
}
