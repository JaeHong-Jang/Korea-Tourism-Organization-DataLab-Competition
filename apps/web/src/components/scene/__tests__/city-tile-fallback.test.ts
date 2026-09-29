// 축제 묶음에서 빠진 타일을 전국 원본으로 보충하는 동작을 검증한다.
import { expect, test, vi } from "vitest";

const calls = vi.hoisted(() => [] as { url: string; x: number; y: number }[]);
vi.mock("@mapbox/vector-tile", () => ({
  VectorTile: class {
    layers = {};
  },
}));
vi.mock("pmtiles", () => ({
  PMTiles: class {
    constructor(private url: string) {}
    async getZxy(_z: number, x: number, y: number) {
      calls.push({ url: this.url, x, y });
      if (this.url.includes("festivals") && calls.length !== 1)
        return undefined;
      return { data: new ArrayBuffer(0) };
    }
  },
}));

import { loadCityTiles } from "../venue/tiles";

test("일부 타일만 있어도 로딩을 중단하지 않고 누락분만 보충한다", async () => {
  await loadCityTiles([127.05, 37.51]);
  const primary = calls.filter(({ url }) => url.includes("festivals"));
  const fallback = calls.filter(({ url }) => !url.includes("festivals"));
  expect(primary.length).toBeGreaterThan(1);
  expect(fallback).toHaveLength(primary.length - 1);
  expect(
    fallback.some(({ x, y }) => x === primary[0].x && y === primary[0].y),
  ).toBe(false);
});
