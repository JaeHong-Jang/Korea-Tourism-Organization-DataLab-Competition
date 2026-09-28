// 지도 작업 취소·늦은 응답·소멸과 형상 버퍼의 복사 없는 전달을 검증한다.
import { BufferGeometry, Float32BufferAttribute } from "three";
import { describe, expect, it } from "vitest";
import { packGeometry, unpackGeometry } from "./geometry-transfer";
import { MAP_COLORS, type MapPalette } from "./map-geometry";
import { MapWorkerClient } from "./map-worker-client";
import type { MapViewport } from "./types";
import type { MapWorkerRequest, MapWorkerResult } from "./worker-protocol";

const view: MapViewport = {
  center: [126.98, 37.57],
  width: 3,
  zoom: 14,
  bounds: [126.96, 37.55, 127, 37.59],
};
const init = () => ({
  kind: "init" as const,
  country: new Float32Array([0, 0, 1, 0, 0, 1]),
  palette: Object.fromEntries(
    MAP_COLORS.map((key) => [key, "#ffffff"]),
  ) as MapPalette,
});
const ready = (id: number): MapWorkerResult => ({
  kind: "ready",
  id,
  buildings: null,
  surfaces: null,
  roads: {
    position: new Float32Array(),
    normal: new Float32Array(),
    color: new Float32Array(),
    sphere: { center: [0, 0, 0], radius: 0 },
  },
  streets: [],
  status: { state: "empty", zoom: 14, buildings: 0, roads: 0, missing: 0 },
});

// 실제 스레드 대신 메시지 순서를 직접 바꿔 요청 경합과 종료를 재현한다.
class WorkerPort {
  onmessage: ((event: MessageEvent<MapWorkerResult>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: MapWorkerRequest[] = [];
  terminated = false;
  postMessage(data: MapWorkerRequest) {
    this.messages.push(data);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: MapWorkerResult) {
    this.onmessage?.({ data } as MessageEvent<MapWorkerResult>);
  }
}

// UI가 취소한 결과는 이후 요청을 덮지 않으며 모든 종료 경로는 Promise를 정리한다.
describe("지도 작업 수명", () => {
  it("취소 후 도착한 결과를 무시하고 다음 지도의 응답을 받는다", async () => {
    const port = new WorkerPort(),
      client = new MapWorkerClient(port as unknown as Worker, init());
    const first = new AbortController(),
      second = new AbortController();
    const failed = expect(
      client.load(view, "high", first.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    first.abort();
    await failed;
    expect(port.messages).toContainEqual({ kind: "cancel", id: 1 });
    const next = client.load(view, "medium", second.signal);
    port.emit(ready(1));
    port.emit(ready(2));
    await expect(next).resolves.toMatchObject({ id: 2 });
    const messages = port.messages.length;
    second.abort();
    expect(port.messages).toHaveLength(messages);
    client.dispose();
    expect(port.terminated).toBe(true);
  });
  it("완료한 작업의 취소 리스너를 제거한다", async () => {
    const port = new WorkerPort(),
      client = new MapWorkerClient(port as unknown as Worker, init());
    const controller = new AbortController(),
      result = client.load(view, "high", controller.signal);
    port.emit(ready(1));
    await result;
    controller.abort();
    expect(
      port.messages.filter((message) => message.kind === "cancel"),
    ).toHaveLength(0);
    client.dispose();
  });
  it("작업 오류를 전달하고 종료 시 나머지 대기 작업을 거부한다", async () => {
    const port = new WorkerPort(),
      client = new MapWorkerClient(port as unknown as Worker, init());
    const failed = expect(
      client.load(view, "high", new AbortController().signal),
    ).rejects.toThrow("타일 손상");
    port.emit({ kind: "error", id: 1, message: "타일 손상" });
    await failed;
    const pending = expect(
      client.load(view, "high", new AbortController().signal),
    ).rejects.toThrow("지도 작업 스레드");
    port.onerror?.();
    await pending;
    expect(port.terminated).toBe(true);
    await expect(
      client.load(view, "high", new AbortController().signal),
    ).rejects.toThrow("종료");
  });
  it("이미 취소된 요청은 스레드로 보내지 않는다", () => {
    const port = new WorkerPort(),
      client = new MapWorkerClient(port as unknown as Worker, init());
    const controller = new AbortController();
    controller.abort();
    expect(() => client.load(view, "high", controller.signal)).toThrow();
    expect(port.messages).toHaveLength(1);
    client.dispose();
  });
});

// 실제 transferable 배열을 이동한 뒤 같은 버퍼와 경계로 렌더 형상을 복원한다.
describe("형상 전송", () => {
  it("전송 시 배열 소유권을 옮기고 렌더 형상에서 다시 복사하지 않는다", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3),
    );
    geometry.setAttribute(
      "color",
      new Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3),
    );
    geometry.computeVertexNormals();
    const packed = packGeometry(geometry),
      sphere = packed.sphere;
    const received = structuredClone(packed, {
      transfer: [
        packed.position.buffer,
        packed.normal.buffer,
        packed.color.buffer,
      ],
    });
    expect(packed.position.byteLength).toBe(0);
    const restored = unpackGeometry(received);
    expect(restored?.getAttribute("position").array).toBe(received.position);
    expect(restored?.getAttribute("normal").array).toBe(received.normal);
    expect(restored?.getAttribute("color").array).toBe(received.color);
    expect(restored?.boundingSphere?.center.toArray()).toEqual(sphere.center);
    expect(restored?.boundingSphere?.radius).toBe(sphere.radius);
    expect(restored?.getAttribute("position").count).toBe(3);
    restored?.dispose();
    expect(unpackGeometry(null)).toBeNull();
  });
});
