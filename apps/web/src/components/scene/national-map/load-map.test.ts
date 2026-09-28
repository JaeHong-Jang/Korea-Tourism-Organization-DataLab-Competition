// 타일마다 누락을 보완하고 취소·손상 자료를 구분하는 로더를 검증한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { viewportTiles } from "./tile-plan";
import type { MapViewport } from "./types";

const fake = vi.hoisted(() => ({
  calls: [] as string[],
  primary: "",
  corrupt: false,
  offline: false,
}));
vi.mock("pmtiles", () => ({
  PMTiles: class {
    constructor(private url: string) {}
    async getZxy(z: number, x: number, y: number, signal: AbortSignal) {
      signal.throwIfAborted();
      fake.calls.push(`${this.url}/${z}/${x}/${y}`);
      if (fake.offline) throw new Error("offline");
      if (this.url.includes("festivals") && `${x}/${y}` !== fake.primary)
        return undefined;
      return {
        data: new Uint8Array([
          fake.corrupt && this.url.includes("festivals") ? 0 : 1,
        ]).buffer,
      };
    }
  },
}));
vi.mock("./read-tile", () => ({
  readMapTile: (bytes: ArrayBuffer) => {
    if (new Uint8Array(bytes)[0] === 0) throw new Error("damaged tile");
    return {
      areas: [],
      buildings: [],
      places: [],
      roads: [
        {
          points: [
            [0, 0],
            [1, 1],
          ],
          kind: "path",
          name: "",
          width: 0.0025,
        },
      ],
    };
  },
}));

const view: MapViewport = {
  center: [126.978, 37.566],
  width: 2,
  zoom: 15,
  bounds: [126.965, 37.55, 126.995, 37.585],
};
beforeEach(() => {
  vi.resetModules();
  fake.calls = [];
  fake.primary = viewportTiles(view)[0].join("/");
  fake.corrupt = false;
  fake.offline = false;
});

// 일부 타일만 있는 축제 묶음 때문에 화면의 나머지 실제 지도를 생략하지 않는다.
describe("로컬 전국 타일 읽기", () => {
  it("첫 타일이 있어도 다른 타일은 전국 묶음에서 각각 보완한다", async () => {
    const { loadMap } = await import("./load-map");
    const result = await loadMap(view, new AbortController().signal);
    expect(viewportTiles(view).length).toBeGreaterThan(1);
    expect(result.data.roads).toHaveLength(viewportTiles(view).length);
    expect(
      fake.calls.some((call) => call.includes("/korea-z15.pmtiles/")),
    ).toBe(true);
    expect(result.missing).toBe(0);
  });
  it("손상된 축제 타일은 전국 원본으로 복구한다", async () => {
    fake.corrupt = true;
    const { loadMap } = await import("./load-map");
    expect(
      (await loadMap(view, new AbortController().signal)).data.roads.length,
    ).toBeGreaterThan(0);
  });
  it("취소한 화면은 파일 요청을 시작하지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const { loadMap } = await import("./load-map");
    await expect(loadMap(view, controller.signal)).rejects.toThrow();
    expect(fake.calls).toEqual([]);
  });
  it("모든 파일 접근 실패는 빈 지도 대신 오류로 알린다", async () => {
    fake.offline = true;
    const { loadMap } = await import("./load-map");
    await expect(loadMap(view, new AbortController().signal)).rejects.toThrow(
      "지도 자료",
    );
  });
});
