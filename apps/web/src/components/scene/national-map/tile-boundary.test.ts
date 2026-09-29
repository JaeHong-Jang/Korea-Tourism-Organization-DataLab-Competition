// 소유 타일 경계와 섬의 지면 판정이 실제 형상과 내부 구멍을 보존하는지 확인한다.
import { BufferGeometry, Float32BufferAttribute } from "three";
import { describe, expect, it } from "vitest";
import type { LandModel } from "../land-tiles";
import { unprojectKorea } from "../projection";
import { countryContains } from "./country-boundary";
import { ownedLines, ownedPolygons, tileProjection } from "./tile-geometry";
import { mapTileAt } from "./tile-plan";
import type { MapPoint } from "./types";

// 버퍼 영역을 없앤 뒤에도 실제 중정 고리가 남고 도로 끝점이 같은 타일 경계를 공유한다.
describe("타일 경계와 국토", () => {
  it("버퍼 도로·건물 조각은 타일 밖에 남기지 않고 내부 고리는 보존한다", () => {
    const [tx, ty] = mapTileAt(126.978, 37.566, 15),
      x = Math.floor(tx),
      y = Math.floor(ty);
    const projection = tileProjection(x, y, 15);
    const geo = (point: MapPoint) => unprojectKorea(...projection.world(point));
    const polygons = ownedPolygons(
      {
        type: "Polygon",
        coordinates: [
          [
            [-100, -100],
            [4200, -100],
            [4200, 4200],
            [-100, 4200],
            [-100, -100],
          ].map((p) => geo(p as MapPoint)),
          [
            [100, 100],
            [100, 200],
            [200, 200],
            [200, 100],
            [100, 100],
          ].map((p) => geo(p as MapPoint)),
        ],
      },
      x,
      y,
      15,
    );
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toHaveLength(2);
    for (const ring of polygons[0])
      for (const point of ring) {
        const local = projection.local(unprojectKorea(...point));
        expect(local[0]).toBeGreaterThanOrEqual(-0.001);
        expect(local[0]).toBeLessThanOrEqual(4096.001);
        expect(local[1]).toBeGreaterThanOrEqual(-0.001);
        expect(local[1]).toBeLessThanOrEqual(4096.001);
      }
    const line = ownedLines(
      { type: "LineString", coordinates: [geo([-100, 100]), geo([4200, 100])] },
      x,
      y,
      15,
    );
    expect(projection.local(unprojectKorea(...line[0][0]))[0]).toBeCloseTo(
      0,
      3,
    );
    expect(projection.local(unprojectKorea(...line[0][1]))[0]).toBeCloseTo(
      4096,
      3,
    );
    expect(
      ownedLines(
        {
          type: "LineString",
          coordinates: [geo([-100, -100]), geo([-50, -50])],
        },
        x,
        y,
        15,
      ),
    ).toEqual([]);
  });
  it("작은 섬도 전체 국토 삼각형으로 판정하고 바다의 점은 제외한다", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        [
          0, 0, 2.5, 10, 0, 2.5, 0, -10, 2.5, 30, -30, 2.5, 31, -30, 2.5, 30,
          -31, 2.5,
        ],
        3,
      ),
    );
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(
        [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        3,
      ),
    );
    const model: LandModel = {
      tiles: [{ sido: "제주특별자치도", geometry, faces: [] }],
      anchors: new Map(),
      centers: new Map(),
      sidoByCode: new Map(),
      bounds: { minX: 0, maxX: 31, minZ: 0, maxZ: 31 },
    };
    const contains = countryContains(model);
    expect(contains([2, 2])).toBe(true);
    expect(contains([30.2, 30.2])).toBe(true);
    expect(contains([20, 20])).toBe(false);
    geometry.dispose();
  });
});
