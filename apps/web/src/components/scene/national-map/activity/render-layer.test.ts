// 중첩 모델이 지도보다 먼저 그려지는 회귀와 깊이 검사 우회를 막는다.
import { expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { applyActivityRenderLayer } from "./render-layer";

it("중간 그룹의 기본 순서 때문에 사람·시설이 지면 아래 레이어로 돌아가지 않는다", () => {
  const root = new Group(),
    festival = new Group(),
    crowd = new Group(),
    geometry = new BoxGeometry(),
    material = new MeshBasicMaterial();
  const people = new InstancedMesh(geometry, material, 2),
    booth = new Mesh(geometry, material);
  root.add(festival);
  festival.add(crowd, booth);
  crowd.add(people);
  applyActivityRenderLayer(root);
  for (const object of [root, festival, crowd, people, booth])
    expect(object.renderOrder).toBeGreaterThan(3);
  expect(material.depthTest).toBe(true);
  expect(material.depthWrite).toBe(true);
  const nightLight = new Mesh(geometry, material);
  crowd.add(nightLight);
  applyActivityRenderLayer(root);
  expect(nightLight.renderOrder).toBe(people.renderOrder);
  geometry.dispose();
  material.dispose();
});
