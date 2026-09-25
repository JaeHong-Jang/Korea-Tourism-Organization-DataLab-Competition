// 강수·구름·안개가 품질 단계에 따라 켜지는지 확인한다.
import type { Weather } from "@crowdcast/contracts/types";
import { MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import { walkingTime } from "../crowd/walk-material";
import { weatherEffects } from "./state";

const weather: Weather = {
  lat: 37.49,
  lng: 126.58,
  at: "2026-09-25T10:00:00+09:00",
  sky: "흐림",
  pty: "비",
  temp: 18,
  pop: 80,
  source: "초단기실황",
  fetchedAt: "2026-09-25T09:50:00+09:00",
};

describe("날씨 연출 상태", () => {
  it("비·눈·안개와 품질별 입자 상한을 구분한다", () => {
    expect(weatherEffects(weather, "high")).toMatchObject({
      precipitation: "rain",
      particles: 160,
      wetGround: true,
    });
    expect(weatherEffects(weather, "medium")).toMatchObject({
      precipitation: "rain",
      particles: 80,
      wetGround: false,
    });
    expect(
      weatherEffects({ ...weather, pty: "눈" }, "high").precipitation,
    ).toBe("snow");
    expect(weatherEffects({ ...weather, pty: "없음" }, "high").fog).toBe(true);
    expect(weatherEffects(weather, "low")).toMatchObject({
      precipitation: null,
      particles: 0,
      cloudy: false,
      fog: false,
    });
  });

  it("모션 감소는 걷기 위상을 0초로 고정한다", () => {
    const material = new MeshBasicMaterial();
    const uniform = { value: 0 };
    material.userData.walkShaders = [{ uniforms: { walkTime: uniform } }];
    walkingTime(material, 12, false);
    expect(uniform.value).toBe(12);
    walkingTime(material, 20, true);
    expect(uniform.value).toBe(0);
    material.dispose();
  });
});
