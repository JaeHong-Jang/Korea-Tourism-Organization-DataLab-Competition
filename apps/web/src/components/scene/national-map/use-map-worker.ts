// 지도 수명 동안 작업 스레드 하나를 유지하고 국토·디자인 토큰만 초기화한다.
import { useEffect, useState } from "react";
import type { LandModel } from "../land-tiles";
import { sceneColor } from "../quality";
import { countryTriangles } from "./country-boundary";
import { MAP_COLORS, type MapPalette } from "./map-geometry";
import { MapWorkerClient } from "./map-worker-client";

// React Strict Mode와 지도 교체에서도 이전 Worker와 대기 요청을 남기지 않는다.
export function useMapWorker(model: LandModel) {
  const [client, setClient] = useState<MapWorkerClient | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    let current: MapWorkerClient;
    try {
      const worker = new Worker(new URL("./map-worker.ts", import.meta.url), {
        type: "module",
      });
      current = new MapWorkerClient(worker, {
        kind: "init",
        elevation: model.elevation,
        country: countryTriangles(model),
        palette: Object.fromEntries(
          MAP_COLORS.map((name) => [name, sceneColor(name)]),
        ) as MapPalette,
      });
      setClient(current);
    } catch {
      setClient(null);
      setError(true);
      return;
    }
    return () => current.dispose();
  }, [model]);
  return { client, error };
}
