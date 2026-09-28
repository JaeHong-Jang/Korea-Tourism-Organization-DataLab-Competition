// 현재 화면의 타일만 읽고 누락 타일을 다른 로컬 묶음에서 보완하며 캐시를 제한한다.
import { PMTiles } from "pmtiles";
import { readMapTile } from "./read-tile";
import { viewportTiles } from "./tile-plan";
import type { MapTile, MapViewport } from "./types";

const archives = new Map<string, PMTiles>();
const cache = new Map<string, MapTile | null>();
const CACHE_LIMIT = 80;

// 단계별 공유 자료와 전국 원본을 타일마다 순서대로 확인한다.
function sources(zoom: number): string[] {
  return zoom <= 8
    ? ["korea-z8", "korea-z13", "korea-z15"]
    : zoom === 15
      ? ["korea-z15-festivals", "korea-z15"]
      : ["korea-z13", "korea-z15"];
}

// 취소된 요청은 캐시에 실패로 남기지 않고 없는 자료와 실제 오류를 구별한다.
async function tileAt(
  zoom: number,
  x: number,
  y: number,
  signal: AbortSignal,
): Promise<MapTile | null> {
  const key = `${zoom}/${x}/${y}`;
  signal.throwIfAborted();
  if (cache.has(key)) {
    const value = cache.get(key) ?? null;
    cache.delete(key);
    cache.set(key, value);
    return value;
  }
  let reachable = false;
  let invalid = false;
  for (const name of sources(zoom)) {
    const url = `/tiles/${name}.pmtiles`;
    let archive = archives.get(url);
    if (!archive) {
      archive = new PMTiles(
        typeof location === "undefined"
          ? url
          : new URL(url, location.href).href,
      );
      archives.set(url, archive);
    }
    try {
      const response = await archive.getZxy(zoom, x, y, signal);
      signal.throwIfAborted();
      reachable = true;
      if (!response) continue;
      let data: MapTile;
      try {
        data = readMapTile(response.data, x, y, zoom);
      } catch {
        invalid = true;
        continue;
      }
      cache.set(key, data);
      while (cache.size > CACHE_LIMIT)
        cache.delete(cache.keys().next().value as string);
      return data;
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  if (invalid || !reachable)
    throw new Error("이 단계의 지도 자료를 불러오지 못했습니다.");
  return null;
}

// 병렬 요청을 네 개로 제한하고 취소 시 다음 묶음을 보내지 않는다.
export async function loadMap(
  view: MapViewport,
  signal: AbortSignal,
): Promise<{ data: MapTile; missing: number }> {
  const tiles = viewportTiles(view),
    parts: (MapTile | null)[] = [];
  for (let offset = 0; offset < tiles.length; offset += 4) {
    signal.throwIfAborted();
    parts.push(
      ...(await Promise.all(
        tiles
          .slice(offset, offset + 4)
          .map(([x, y]) => tileAt(view.zoom, x, y, signal)),
      )),
    );
  }
  return {
    missing: parts.filter((part) => !part).length,
    data: {
      areas: parts.flatMap((part) => part?.areas ?? []),
      roads: parts.flatMap((part) => part?.roads ?? []),
      buildings: parts.flatMap((part) => part?.buildings ?? []),
      places: parts.flatMap((part) => part?.places ?? []),
    },
  };
}
