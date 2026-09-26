// 행사 수가 같아도 지역 변경 뒤 새 모형 위치에서 포인터가 닿는지 검증한다.
import {
  BoxGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { sceneFestivals } from "../../../lib/festivals/scene-fixture";
import { positionHitTargets } from "../festival-hit-targets";
import { placeFestivals } from "../festival-models/placement";
import { LAND_SURFACE_Y } from "../scene-height";

describe("행사 모형 선택 경계", () => {
  // 서울 다섯 건을 부산 다섯 건으로 바꾼 뒤 부산 모형의 인스턴스를 찾는다.
  it("같은 개수의 다른 지역으로 필터를 바꿔도 새 위치에서 선택된다", () => {
    const festivals = sceneFestivals("2025-10-18");
    const seoul = placeFestivals(
      festivals.filter((festival) => festival.sigunguCode === "11110"),
    );
    const busan = placeFestivals(
      festivals.filter((festival) => festival.sigunguCode === "26110"),
    );
    expect(seoul).toHaveLength(5);
    expect(busan).toHaveLength(5);
    const geometry = new BoxGeometry(12, 17, 12);
    const material = new MeshBasicMaterial();
    const mesh = new InstancedMesh(geometry, material, seoul.length);
    const dummy = new Object3D();
    positionHitTargets(mesh, seoul, dummy);
    const previousCenter = mesh.boundingSphere?.center.clone();

    // 새 경계가 이전 도시에서 옮겨졌는지 광선 교차로 확인한다.
    positionHitTargets(mesh, busan, dummy);
    expect(
      mesh.boundingSphere?.center.distanceTo(previousCenter ?? new Vector3()),
    ).toBeGreaterThan(100);
    const target = busan[0];
    const ray = new Raycaster(
      new Vector3(target.x, LAND_SURFACE_Y + target.y + 100, target.z),
      new Vector3(0, -1, 0),
    );
    expect(ray.intersectObject(mesh)[0]?.instanceId).toBe(0);
    geometry.dispose();
    material.dispose();
  });
});
