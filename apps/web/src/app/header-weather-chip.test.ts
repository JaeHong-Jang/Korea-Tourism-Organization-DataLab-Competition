// 날씨 칩의 실황·단기·중기·정보 없음 문구를 확인한다.
import type { Weather } from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import { weatherChipText } from "./header-weather-chip";

const weather: Weather = {
  lat: 37.49,
  lng: 126.58,
  at: "2026-09-25T10:00:00+09:00",
  sky: "흐림",
  pty: "없음",
  temp: 18,
  pop: 20,
  source: "초단기실황",
  fetchedAt: "2026-09-25T09:50:00+09:00",
};

describe("헤더 날씨 칩", () => {
  it("실황과 단기 예보는 시각 기온과 강수를 쓴다", () => {
    expect(weatherChipText("인천 중구", "밤", weather)).toBe(
      "인천 중구 18° 흐림 · 밤",
    );
    expect(
      weatherChipText("인천 중구", "낮", {
        ...weather,
        source: "단기예보",
        pty: "눈",
      }),
    ).toBe("인천 중구 18° 눈 · 낮");
  });
  it("중기 예보는 최저~최고를 쓰고 빈 자료는 정보 없음으로 남긴다", () => {
    expect(
      weatherChipText("인천 중구", "밤", {
        ...weather,
        source: "중기예보",
        temp: null,
        tempMin: 12,
        tempMax: 21,
      }),
    ).toBe("인천 중구 12~21° 흐림 · 밤");
    expect(weatherChipText("서울", "낮", { ...weather, source: "없음" })).toBe(
      "서울 날씨 정보 없음 · 낮",
    );
  });
});
