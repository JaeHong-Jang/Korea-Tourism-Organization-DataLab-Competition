// 한반도 중심 횡메르카토르 좌표를 1단위 1km의 장면 좌표로 바꾼다.
import { geoTransverseMercator } from "d3-geo";

const EARTH_RADIUS_KM = 6371.0088;

// 같은 투영 인스턴스를 모든 타일과 카메라 표적에 사용한다.
const projection = geoTransverseMercator()
  .rotate([-127.5, 0])
  .center([0, 36])
  .scale(EARTH_RADIUS_KM)
  .translate([0, 0]);

// 지도의 동쪽을 x 양수, 남쪽을 z 양수로 둔다.
export function projectKorea(
  longitude: number,
  latitude: number,
): [number, number] {
  const point = projection([longitude, latitude]);
  if (!point) throw new Error("시군구 좌표를 투영할 수 없습니다.");
  return [point[0], point[1]];
}
