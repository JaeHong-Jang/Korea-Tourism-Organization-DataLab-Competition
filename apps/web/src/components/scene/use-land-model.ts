// 공개 시군구 경계를 읽어 전국 판의 병합 지형으로 만든다.
import { useEffect, useMemo, useState } from "react";
import type { Topology } from "topojson-specification";
import { buildLandModelForData } from "./land-tiles";

// 경계 요청을 취소할 수 있게 두고 자료 교체 때 GPU 지형 버퍼를 해제한다.
export function useLandModel(
  webgl: boolean,
  dataMode: boolean,
  totals: Map<string, number>,
) {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!webgl) return;
    const controller = new AbortController();
    fetch("/geo/sigungu.topo.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`경계 파일 ${response.status}`);
        return response.json();
      })
      .then((data: Topology) => setTopology(data))
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [webgl]);

  // 색상 데이터 모드가 바뀌면 타일 버퍼만 다시 만들어 전달한다.
  const model = useMemo(
    () =>
      topology
        ? buildLandModelForData(topology, dataMode ? totals : null)
        : null,
    [topology, dataMode, totals],
  );
  useEffect(
    () => () => {
      model?.tiles.forEach((tile) => {
        tile.geometry.dispose();
      });
    },
    [model],
  );
  return { model, error };
}
