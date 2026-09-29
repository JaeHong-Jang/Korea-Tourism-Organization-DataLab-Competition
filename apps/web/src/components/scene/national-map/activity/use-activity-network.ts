// 작업 스레드 요청을 하나로 제한하고 화면 여유 영역 안의 작은 이동은 재계산하지 않는다.
import { useEffect, useRef, useState } from "react";
import type { MapTile } from "../types";
import type { ActivityWindow } from "./window";
import type { ActivityNetworks, ActivityRequest } from "./activity-worker";
type Snapshot = { data: MapTile; window: ActivityWindow; people: boolean };
const empty = () => ({ edges: new Map(), out: new Map() });

// 이전에 계산한 여유 영역 안에서는 연결 그래프와 이동 객체를 그대로 사용한다.
function covered(next: Snapshot, previous: Snapshot | null) {
  if (
    !previous ||
    next.data !== previous.data ||
    next.people !== previous.people ||
    next.window.width > 8 !== previous.window.width > 8 ||
    next.window.width > 90 !== previous.window.width > 90
  )
    return false;
  const a = next.window,
    b = previous.window,
    pad = b.width * 0.16;
  return (
    a.minX >= b.minX - pad &&
    a.maxX <= b.maxX + pad &&
    a.minZ >= b.minZ - pad &&
    a.maxZ <= b.maxZ + pad
  );
}

// 처리 중에는 가장 최근 요청 하나만 보관해 드래그가 끝난 화면부터 계산한다.
export function useActivityNetwork(
  data: MapTile,
  window: ActivityWindow,
  people: boolean,
) {
  const [networks, setNetworks] = useState<ActivityNetworks>(() => ({
    cars: empty(),
    people: empty(),
    trains: empty(),
  }));
  const queue = useRef<(snapshot: Snapshot) => void>(() => {});
  useEffect(() => {
    const worker = new Worker(
      new URL("./activity-worker.ts", import.meta.url),
      { type: "module" },
    );
    let busy = false,
      closed = false,
      id = 0,
      sentData: MapTile | null = null,
      last: Snapshot | null = null,
      pending: Snapshot | null = null;
    const send = () => {
      if (busy || !pending || closed) return;
      const next = pending;
      pending = null;
      last = next;
      busy = true;
      const message: ActivityRequest = {
        id: ++id,
        window: next.window,
        people: next.people,
      };
      if (sentData !== next.data) {
        message.data = next.data;
        sentData = next.data;
      }
      worker.postMessage(message);
    };
    queue.current = (next) => {
      if (covered(next, last)) {
        pending = null;
        return;
      }
      pending = next;
      send();
    };
    worker.onmessage = (
      event: MessageEvent<{ id: number; networks: ActivityNetworks }>,
    ) => {
      if (closed) return;
      busy = false;
      setNetworks(event.data.networks);
      send();
    };
    worker.onerror = () => {
      busy = false;
      pending = null;
    };
    return () => {
      closed = true;
      pending = null;
      queue.current = () => {};
      worker.terminate();
    };
  }, []);
  useEffect(() => {
    queue.current({ data, window, people });
  }, [data, window, people]);
  return networks;
}
