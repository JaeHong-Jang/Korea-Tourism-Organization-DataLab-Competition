// 작업 스레드 요청의 취소·오류·소멸을 관리해 오래된 지도 결과가 화면에 남지 않게 한다.
import type { SceneQuality } from "../quality";
import type { MapViewport } from "./types";
import type { MapWorkerRequest, MapWorkerResult } from "./worker-protocol";

type Ready = Extract<MapWorkerResult, { kind: "ready" }>;
type Pending = {
  resolve: (data: Ready) => void;
  reject: (error: Error) => void;
  clear: () => void;
};

// 실제 Worker와 테스트용 메시지 포트를 같은 취소 경로로 다룬다.
export class MapWorkerClient {
  private next = 0;
  private pending = new Map<number, Pending>();
  private closed = false;
  constructor(
    private worker: Worker,
    init: Extract<MapWorkerRequest, { kind: "init" }>,
  ) {
    worker.onmessage = ({ data }: MessageEvent<MapWorkerResult>) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      request.clear();
      if (data.kind === "ready") request.resolve(data);
      else request.reject(new Error(data.message));
    };
    worker.onerror = () =>
      this.dispose(new Error("지도 작업 스레드를 시작하지 못했습니다."));
    worker.onmessageerror = () =>
      this.dispose(new Error("지도 작업 결과를 읽지 못했습니다."));
    try {
      worker.postMessage(init, [init.country.buffer as ArrayBuffer]);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  // 취소는 UI에서 즉시 반영하며 나중에 도착하는 같은 ID 결과는 무시한다.
  load(
    view: MapViewport,
    quality: SceneQuality,
    signal: AbortSignal,
  ): Promise<Ready> {
    if (this.closed)
      return Promise.reject(new Error("지도 작업 스레드가 종료되었습니다."));
    signal.throwIfAborted();
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const cancel = () => {
        this.pending.delete(id);
        signal.removeEventListener("abort", cancel);
        this.worker.postMessage({
          kind: "cancel",
          id,
        } satisfies MapWorkerRequest);
        reject(new DOMException("지도 요청을 취소했습니다.", "AbortError"));
      };
      this.pending.set(id, {
        resolve,
        reject,
        clear: () => signal.removeEventListener("abort", cancel),
      });
      signal.addEventListener("abort", cancel, { once: true });
      try {
        this.worker.postMessage({
          kind: "load",
          id,
          view,
          quality,
        } satisfies MapWorkerRequest);
      } catch (error) {
        this.pending.delete(id);
        signal.removeEventListener("abort", cancel);
        reject(error);
      }
    });
  }

  // 화면을 떠나거나 Worker가 실패하면 모든 대기 Promise와 네트워크 작업을 정리한다.
  dispose(error: Error = new DOMException("지도를 닫았습니다.", "AbortError")) {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    for (const request of this.pending.values()) {
      request.clear();
      request.reject(error);
    }
    this.pending.clear();
  }
}
