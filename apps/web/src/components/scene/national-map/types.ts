// 전국 지도에서 같은 투영으로 표시하는 실제 면·도로·건물과 카메라 요청을 정의한다.
export type MapPoint = [number, number];
export type MapArea = { kind: string; polygons: MapPoint[][][] };
export type MapRoad = {
  kind: string;
  points: MapPoint[];
  width: number;
  name: string;
};
export type MapBuilding = {
  id: string;
  polygons: MapPoint[][][];
  height: number;
  minHeight: number;
  estimated: boolean;
};
export type MapPlace = { name: string; point: MapPoint; kind: string };
export type MapTile = {
  areas: MapArea[];
  roads: MapRoad[];
  buildings: MapBuilding[];
  places: MapPlace[];
};
export type MapViewport = {
  center: MapPoint;
  width: number;
  bounds: [number, number, number, number];
  zoom: number;
};
export type MapStatus = {
  state: "loading" | "ready" | "empty" | "error";
  zoom: number;
  buildings: number;
  roads: number;
  missing: number;
};
export type NavigationMode = "pan" | "rotate";
export type MapCommand = {
  id: number;
  kind: "overview" | "above" | "zoom-in" | "zoom-out" | "region";
  point?: MapPoint;
};
