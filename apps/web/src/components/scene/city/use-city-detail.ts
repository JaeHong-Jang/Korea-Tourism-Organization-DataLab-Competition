// 자유 확대 전에 건물 자료를 확인하고 빈 동네로 화면이 바뀌지 않게 한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { loadCityTiles } from "../venue/tiles";

export function useCityDetail(
  onReady: (center: [number, number]) => void,
  revision: number,
) {
  const pending = useRef<AbortController | null>(null);
  const attempted = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 전국 복귀와 컴포넌트 해제 후 늦게 끝난 요청이 화면을 바꾸지 않게 한다.
  useEffect(() => {
    if (revision >= 0) {
      pending.current?.abort();
      pending.current = null;
      attempted.current = null;
      setNotice(null);
    }
    return () => {
      pending.current?.abort();
    };
  }, [revision]);

  const request = useCallback(
    async (center: [number, number]) => {
      const key = center.map((value) => value.toFixed(3)).join(",");
      if (pending.current || attempted.current === key) return;
      attempted.current = key;
      const controller = new AbortController();
      pending.current = controller;
      setNotice("이 위치의 건물 자료를 확인하고 있어요.");
      try {
        const tiles = await loadCityTiles(center, controller.signal);
        if (controller.signal.aborted) return;
        if (
          !tiles.buildings.some(
            (building) => (building.footprint?.length ?? 0) >= 3,
          )
        ) {
          setNotice(
            "이 위치는 건물 자료가 없어 기존 지도를 유지해요. 다른 지역으로 이동해 주세요.",
          );
          return;
        }
        setNotice(null);
        onReady(center);
      } catch {
        if (!controller.signal.aborted)
          setNotice("건물 자료를 불러오지 못했어요. 기존 지도를 유지해요.");
      } finally {
        if (pending.current === controller) pending.current = null;
      }
    },
    [onReady],
  );

  return { request, notice };
}
