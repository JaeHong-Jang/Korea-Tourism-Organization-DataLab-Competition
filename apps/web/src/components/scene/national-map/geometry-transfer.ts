// 완성된 형상 버퍼를 복사 없이 이동하고 메인 스레드에서는 속성만 연결한다.
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three";
import type { PackedGeometry } from "./worker-protocol";

// 경계 구까지 작업 스레드에서 계산해 화면에서 큰 좌표 배열을 다시 순회하지 않는다.
export function packGeometry(geometry: BufferGeometry): PackedGeometry {
  geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere;
  if (!sphere) throw new Error("지도 형상의 경계를 계산하지 못했습니다.");
  const data = {
    position: geometry.getAttribute("position").array as Float32Array,
    normal: geometry.getAttribute("normal").array as Float32Array,
    color: geometry.getAttribute("color").array as Float32Array,
    sphere: { center: sphere.center.toArray(), radius: sphere.radius },
  };
  geometry.dispose();
  return data;
}

// BufferAttribute 생성 시 원본 배열을 공유해 수십 MB 버퍼의 두 번째 복사를 피한다.
export function unpackGeometry(
  data: PackedGeometry | null,
): BufferGeometry | null {
  if (!data) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.position, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normal, 3));
  geometry.setAttribute("color", new BufferAttribute(data.color, 3));
  geometry.boundingSphere = new Sphere(
    new Vector3(...data.sphere.center),
    data.sphere.radius,
  );
  return geometry;
}
