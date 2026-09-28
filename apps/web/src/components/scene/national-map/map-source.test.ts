// 전국 지도 투영·실제 건물 높이·내부 구멍·타일 상한을 검증한다.
import { OrthographicCamera, ShapeGeometry, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { largestClearRect } from "../camera-framing";
import { projectKorea, unprojectKorea } from "../projection";
import { LAND_SURFACE_Y } from "../scene-height";
import { nationalCameraPose } from "./camera-pose";
import { mapShape } from "./map-geometry";
import { mapBuildingHeight } from "./read-tile";
import { MAX_MAP_TILES, mapZoom, viewportTiles } from "./tile-plan";

// 성남·부산·제주의 경위도와 km 좌표가 카메라 이동 후에도 서로 변환된다.
describe("실제 전국 좌표와 높이", () => {
  it.each([
    [127.11, 37.39],
    [129.0756, 35.1796],
    [126.53, 33.5],
  ])("%s/%s 투영 왕복", (lng, lat) => {
    const restored = unprojectKorea(...projectKorea(lng, lat));
    expect(restored[0]).toBeCloseTo(lng, 7);
    expect(restored[1]).toBeCloseTo(lat, 7);
  });
  it("실측 높이, 층수 추정, 기본 높이를 구분한다", () => {
    expect(mapBuildingHeight({ height: 30, min_height: 6 })).toEqual({
      height: 0.03,
      minHeight: 0.006,
      estimated: false,
    });
    expect(mapBuildingHeight({ "building:levels": 5 })).toEqual({
      height: 0.015,
      minHeight: 0,
      estimated: true,
    });
    expect(mapBuildingHeight({})).toEqual({
      height: 0.009,
      minHeight: 0,
      estimated: true,
    });
    const limited = mapBuildingHeight({ height: 900, min_height: 850 });
    expect(limited.height).toBe(0.6);
    expect(limited.minHeight).toBeLessThan(limited.height);
  });
  it("건물 중정의 면적을 지붕으로 채우지 않는다", () => {
    const geometry = new ShapeGeometry(
      mapShape([
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [3, 7],
          [7, 7],
          [7, 3],
          [3, 3],
        ],
      ]),
    );
    const position = geometry.getAttribute("position"),
      indices = geometry.index;
    if (!indices) throw new Error("삼각형 인덱스가 없습니다.");
    let area = 0;
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i),
        b = indices.getX(i + 1),
        c = indices.getX(i + 2);
      area +=
        Math.abs(
          (position.getX(b) - position.getX(a)) *
            (position.getY(c) - position.getY(a)) -
            (position.getY(b) - position.getY(a)) *
              (position.getX(c) - position.getX(a)),
        ) / 2;
    }
    expect(area).toBeCloseTo(84);
    geometry.dispose();
  });
});

// 극단적인 화면에서도 전국 상세 타일을 모두 열지 않고 가까운 자료만 요청한다.
describe("상세 단계와 카메라 구도", () => {
  it("전국과 동네 확대를 서로 다른 단계로 읽는다", () => {
    expect(mapZoom(1200, 36)).toBe(7);
    expect(mapZoom(2, 36)).toBe(15);
    expect(
      viewportTiles({
        center: [127, 36],
        width: 0.1,
        zoom: 15,
        bounds: [-180, -80, 180, 80],
      }),
    ).toHaveLength(MAX_MAP_TILES);
    expect(
      viewportTiles({
        center: [140, 40],
        width: 10,
        zoom: 15,
        bounds: [139, 39, 141, 41],
      }),
    ).toEqual([]);
  });
  it("양쪽 패널을 피해 전국 모서리를 안전 영역에 담는다", () => {
    const bounds = {
      width: 1440,
      height: 844,
      blockers: [
        { left: 32, top: 32, right: 332, bottom: 828 },
        { left: 1048, top: 32, right: 1408, bottom: 828 },
      ],
    };
    const safe = largestClearRect(bounds),
      pose = nationalCameraPose(bounds, [0, 0], 600, 900);
    const camera = new OrthographicCamera(-720, 720, 422, -422, 0.1, 5000);
    camera.position.copy(pose.position);
    camera.zoom = pose.zoom;
    camera.lookAt(pose.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    for (const x of [-300, 300])
      for (const z of [-450, 450]) {
        const point = new Vector3(x, LAND_SURFACE_Y, z).project(camera);
        const sx = (point.x + 1) * 720,
          sy = (1 - point.y) * 422;
        expect(sx).toBeGreaterThanOrEqual(safe.left);
        expect(sx).toBeLessThanOrEqual(safe.right);
        expect(sy).toBeGreaterThanOrEqual(safe.top);
        expect(sy).toBeLessThanOrEqual(safe.bottom);
      }
  });
});
