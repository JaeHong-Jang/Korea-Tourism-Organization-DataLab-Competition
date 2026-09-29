// 국토의 실제 윗면 삼각형으로 섬을 포함한 대한민국 안쪽 좌표를 판정한다.
import type { LandModel } from "../land-tiles";
import type { MapPoint } from "./types";

type Triangle = {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cx: number;
  cz: number;
};
const CELL = 20;

// 지도 형상은 유지하고 작은 국토 좌표 배열만 복사해 작업 스레드에 전달한다.
export function countryTriangles(model: LandModel): Float32Array {
  if (model.country) return model.country.slice();
  const triangles: number[] = [];
  for (const { geometry } of model.tiles) {
    const positions = geometry.getAttribute("position"),
      normals = geometry.getAttribute("normal");
    for (let i = 0; i < positions.count; i += 3) {
      if (normals.getZ(i) < 0.99) continue;
      triangles.push(
        positions.getX(i),
        -positions.getY(i),
        positions.getX(i + 1),
        -positions.getY(i + 1),
        positions.getX(i + 2),
        -positions.getY(i + 2),
      );
    }
  }
  return new Float32Array(triangles);
}

// 시군구 전체 삼각형을 공간 격자로 묶어 작은 섬과 해안 건물도 실제 좌표로 판정한다.
export function countryContainsTriangles(
  triangles: Float32Array,
): (point: MapPoint) => boolean {
  const cells = new Map<string, Triangle[]>();
  for (let i = 0; i < triangles.length; i += 6) {
    const triangle = {
      ax: triangles[i],
      az: triangles[i + 1],
      bx: triangles[i + 2],
      bz: triangles[i + 3],
      cx: triangles[i + 4],
      cz: triangles[i + 5],
    };
    const left = Math.floor(
        Math.min(triangle.ax, triangle.bx, triangle.cx) / CELL,
      ),
      right = Math.floor(
        Math.max(triangle.ax, triangle.bx, triangle.cx) / CELL,
      );
    const top = Math.floor(
        Math.min(triangle.az, triangle.bz, triangle.cz) / CELL,
      ),
      bottom = Math.floor(
        Math.max(triangle.az, triangle.bz, triangle.cz) / CELL,
      );
    for (let x = left; x <= right; x++)
      for (let z = top; z <= bottom; z++) {
        const key = `${x}/${z}`;
        const list = cells.get(key);
        if (list) list.push(triangle);
        else cells.set(key, [triangle]);
      }
  }
  return ([x, z]) =>
    (cells.get(`${Math.floor(x / CELL)}/${Math.floor(z / CELL)}`) ?? []).some(
      (t) => {
        const a = (t.bx - t.ax) * (z - t.az) - (t.bz - t.az) * (x - t.ax);
        const b = (t.cx - t.bx) * (z - t.bz) - (t.cz - t.bz) * (x - t.bx);
        const c = (t.ax - t.cx) * (z - t.cz) - (t.az - t.cz) * (x - t.cx);
        return !(
          (a < -1e-8 || b < -1e-8 || c < -1e-8) &&
          (a > 1e-8 || b > 1e-8 || c > 1e-8)
        );
      },
    );
}

// 검사와 기존 지도 호출은 같은 삼각형 판정 함수를 공유한다.
export function countryContains(model: LandModel) {
  return countryContainsTriangles(countryTriangles(model));
}
