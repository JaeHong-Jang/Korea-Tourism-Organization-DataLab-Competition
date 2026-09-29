// 회색 건물이 외곽선과 원본 높이를 유지하고 없는 건물을 만들어내지 않는지 검증한다.
import { describe, expect, it } from "vitest";
import { grayBuildingGeometry } from "../city/gray-building-geometry";
import { projectKorea, unprojectKorea } from "../projection";
import { buildingHeight } from "../venue/tile-tags";
import type { VenueBuilding } from "../venue/tiles";

const building: VenueBuilding = {
  x: 10,
  z: 5,
  width: 20,
  depth: 10,
  height: 250,
  minHeight: 10,
  footprint: [
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
  ],
};
describe("회색 건물 형상", () => {
  it("외곽선과 높이를 과장하지 않고 원본 좌표에 세운다", () => {
    const geometry = grayBuildingGeometry([building]);
    expect(geometry).not.toBeNull();
    geometry?.computeBoundingBox();
    expect(geometry?.boundingBox?.min.x).toBeCloseTo(0);
    expect(geometry?.boundingBox?.max.x).toBeCloseTo(20);
    expect(geometry?.boundingBox?.min.z).toBeCloseTo(0);
    expect(geometry?.boundingBox?.max.z).toBeCloseTo(10);
    expect(geometry?.boundingBox?.min.y).toBeCloseTo(10);
    expect(geometry?.boundingBox?.max.y).toBeCloseTo(250);
    geometry?.dispose();
  });
  it("자료가 없거나 외곽선이 깨졌으면 가짜 상자를 만들지 않는다", () => {
    expect(grayBuildingGeometry([])).toBeNull();
    expect(
      grayBuildingGeometry([{ ...building, footprint: undefined }]),
    ).toBeNull();
    expect(
      grayBuildingGeometry([
        {
          ...building,
          footprint: [
            [NaN, 0],
            [2, 0],
            [0, 2],
          ],
        },
      ]),
    ).toBeNull();
  });
  it("실제 고층 건물 높이는 이전 장난감 상한 100m로 자르지 않는다", () => {
    expect(buildingHeight({ height: 555 }, 1000)).toEqual([555, 0]);
  });
  it("확대한 위치를 경위도로 되돌려도 다른 축제 좌표로 바뀌지 않는다", () => {
    const point = unprojectKorea(...projectKorea(126.978, 37.5665));
    expect(point?.[0]).toBeCloseTo(126.978, 6);
    expect(point?.[1]).toBeCloseTo(37.5665, 6);
  });
});
