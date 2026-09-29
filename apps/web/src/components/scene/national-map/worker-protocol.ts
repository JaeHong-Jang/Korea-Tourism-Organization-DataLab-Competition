// 지도 작업 스레드에는 실제 좌표·토큰 색을 보내고 완성된 GPU 버퍼만 받는다.

import type { SceneQuality } from "../quality";
import type { ElevationGrid } from "../terrain/elevation";
import type { MapPalette } from "./map-geometry";
import type { MapRoad, MapStatus, MapViewport, MapTile } from "./types";

export type PackedGeometry = {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  sphere: { center: [number, number, number]; radius: number };
};
export type MapWorkerRequest =
  | { kind: "init"; country: Float32Array; palette: MapPalette; elevation?: ElevationGrid }
  | { kind: "load"; id: number; view: MapViewport; quality: SceneQuality }
  | { kind: "cancel"; id: number };
export type MapWorkerResult =
  | {
      kind: "ready";
      id: number;
      status: MapStatus;
      buildings: PackedGeometry | null;
      ground?: PackedGeometry | null;
      surfaces: PackedGeometry | null;
      roads: PackedGeometry;
      streets: MapRoad[];
      activity?: MapTile;
    }
  | { kind: "error"; id: number; message: string };
