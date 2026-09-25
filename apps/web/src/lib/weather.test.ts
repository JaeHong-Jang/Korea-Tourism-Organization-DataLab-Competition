// 날씨 계약 검증과 저장소·네트워크 오류의 대체 응답을 검증한다.
// @vitest-environment jsdom
import type { Weather } from "@crowdcast/contracts/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedWeather, readWeather, weatherCacheKey } from "./weather";

const at = new Date("2026-09-25T10:00:00+09:00");
const rain: Weather = {
  lat: 37.49,
  lng: 126.58,
  at: at.toISOString(),
  sky: "흐림",
  pty: "비",
  temp: 18,
  pop: 80,
  source: "초단기실황",
  fetchedAt: at.toISOString(),
};

// 각 요청은 브라우저 저장소와 fetch 교체를 다음 사례에 남기지 않는다.
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("날씨 읽기", () => {
  it("계약 응답을 캐시하고 실패 시 같은 장소·날짜의 응답을 쓴다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(rain), { status: 200 })),
    );
    expect(await readWeather(rain.lat, rain.lng, at)).toEqual(rain);
    expect(cachedWeather(weatherCacheKey(rain.lat, rain.lng, at))).toEqual(
      rain,
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await readWeather(rain.lat, rain.lng, at)).toEqual(rain);
  });

  it("캐시가 없으면 정보 없음과 맑은 장면 입력을 돌린다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const fallback = await readWeather(rain.lat, rain.lng, at);
    expect(fallback).toMatchObject({
      source: "없음",
      sky: "맑음",
      pty: "없음",
    });
  });

  it("계약 밖 값과 빈 예보는 이전 날씨를 훼손하지 않는다", async () => {
    const key = weatherCacheKey(rain.lat, rain.lng, at);
    localStorage.setItem(key, JSON.stringify(rain));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...rain, source: "없음" })),
        ),
    );
    expect(await readWeather(rain.lat, rain.lng, at)).toEqual(rain);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...rain, pty: "태풍" })),
        ),
    );
    expect(await readWeather(rain.lat, rain.lng, at)).toEqual(rain);
  });
});
