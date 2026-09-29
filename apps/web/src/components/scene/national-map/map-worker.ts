// 타일 파싱·국토 판정·건물 형상 계산을 UI 스레드 밖에서 수행한다.

import { projectKorea } from "../projection";
import { drapeGeometry } from "../terrain/drape-geometry";
import { localGround } from "../terrain/local-ground";
import { terrainDetailStep } from "../terrain/terrain-detail";
import type { ElevationGrid } from "../terrain/elevation";
import { visibleAreas, visibleRoads } from "./area-detail";
import { countryContainsTriangles } from "./country-boundary";
import { packGeometry } from "./geometry-transfer";
import { loadMap } from "./load-map";
import {
  buildingGeometry,
  type MapPalette,
  roadGeometry,
  surfaceGeometry,
} from "./map-geometry";
import type { MapPoint, MapTile } from "./types";
import type {
  MapWorkerRequest,
  MapWorkerResult,
  PackedGeometry,
} from "./worker-protocol";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<MapWorkerRequest>) => void;
  postMessage: (message: MapWorkerResult, transfer?: Transferable[]) => void;
};
const jobs = new Map<number, AbortController>();
let contains: (point: MapPoint) => boolean = () => false;
let palette: MapPalette;
let elevation: ElevationGrid | undefined;

// 완료 형상의 버퍼 소유권만 옮겨 큰 구조화 복사와 메인 스레드 재계산을 피한다.
function transfers(...geometries: (PackedGeometry | null)[]): Transferable[] {
  return geometries.flatMap((geometry) =>
    geometry
      ? ([
          geometry.position.buffer,
          geometry.normal.buffer,
          geometry.color.buffer,
        ] as ArrayBuffer[])
      : [],
  );
}

// 국토 필터와 가까운 건물 상한을 이전 장면과 동일하게 적용한다.
async function prepare(request: Extract<MapWorkerRequest, { kind: "load" }>) {
  const controller = new AbortController();
  jobs.set(request.id, controller);
  try {
    const { data, missing } = await loadMap(request.view, controller.signal);
    controller.signal.throwIfAborted();
    // 화면에서 2픽셀보다 작은 토지 피복 면은 그리지 않는다(전국 화면의 삼각형 대부분이 여기서 나온다).
    const tile: MapTile = {
      ...data,
      areas: visibleAreas(data.areas, request.view.width),
      buildings: data.buildings.filter((building) =>
        building.polygons.some((rings) => rings[0].some(contains)),
      ),
      roads: visibleRoads(data.roads, request.view.width).filter((road) =>
        road.points.some(contains),
      ),
    };
    const [cx, cz] = projectKorea(...request.view.center);
    const cap =
      request.quality === "high"
        ? 7000
        : request.quality === "medium"
          ? 4000
          : 1800;
    const near = tile.buildings
      .map((building) => {
        const p = building.polygons[0][0][0];
        return { building, distance: (p[0] - cx) ** 2 + (p[1] - cz) ** 2 };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, cap)
      .map(({ building }) => building);
    const buildingMesh = buildingGeometry(near, palette, elevation);
    let surfaceMesh = surfaceGeometry(tile, palette);
    let roadMesh = roadGeometry(tile.roads, palette);
    if (elevation) {
      // 전국 화면에서는 수 픽셀 간격만 분할하고 확대할 때 기존 세밀한 고도 표본으로 복원한다.
      const step = terrainDetailStep(request.view.width);
      if (surfaceMesh) surfaceMesh = drapeGeometry(surfaceMesh, elevation, step);
      roadMesh = drapeGeometry(roadMesh, elevation, step);
    }
    const buildings = buildingMesh ? packGeometry(buildingMesh) : null,
      surfaces = surfaceMesh ? packGeometry(surfaceMesh) : null;
    const roads = packGeometry(roadMesh);
    const groundMesh = elevation ? localGround(request.view, elevation, contains, palette['city-land']) : null;
    const ground = groundMesh ? packGeometry(groundMesh) : null;
    const count = tile.buildings.length + tile.roads.length + tile.areas.length;
    controller.signal.throwIfAborted();
    scope.postMessage(
      {
        kind: "ready",
        id: request.id,
        buildings,
        surfaces,
        roads,
        ground,
        streets: tile.roads,
        activity: request.view.zoom >= 11 ? { ...data, buildings: tile.buildings } : undefined,
        status: {
          state: count ? "ready" : "empty",
          zoom: request.view.zoom,
          buildings: tile.buildings.length,
          roads: tile.roads.length,
          missing,
        },
      },
      transfers(buildings, surfaces, roads, ground),
    );
  } catch (error) {
    if (!controller.signal.aborted)
      scope.postMessage({
        kind: "error",
        id: request.id,
        message:
          error instanceof Error
            ? error.message
            : "지도를 계산하지 못했습니다.",
      });
  } finally {
    jobs.delete(request.id);
  }
}

// 이동 중 취소와 국토 초기화를 분리하고 소멸한 요청에는 결과를 발행하지 않는다.
scope.onmessage = ({ data }) => {
  if (data.kind === "init") {
    contains = countryContainsTriangles(data.country);
    palette = data.palette;
    elevation = data.elevation;
  } else if (data.kind === "cancel") jobs.get(data.id)?.abort();
  else void prepare(data);
};
