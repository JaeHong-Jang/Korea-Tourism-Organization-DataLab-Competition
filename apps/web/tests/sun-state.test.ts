// 고정된 서울 시각으로 해 고도와 데모 URL을 검증한다.
import { describe, expect, it } from "vitest";
import {
  getDemoTheme,
  getDemoTime,
  getSkyState,
  getTheme,
} from "../src/lib/theme/sun-state";

describe("서울 해 상태", () => {
  // 한낮·일몰 직후·밤을 고정 시각으로 재현한다.
  it("실제 해 고도로 낮·노을·밤을 나눈다", () => {
    expect(getSkyState(new Date("2026-10-18T12:00:00+09:00"))).toBe("day");
    expect(getSkyState(new Date("2026-10-18T18:00:00+09:00"))).toBe("dusk");
    expect(getSkyState(new Date("2026-10-18T19:00:00+09:00"))).toBe("night");
  });

  // 자동 선택만 밤 하늘을 따라가고 수동 선택은 유지한다.
  it("테마 선택과 해 상태를 합친다", () => {
    expect(getTheme("auto", "dusk")).toBe("day");
    expect(getTheme("auto", "night")).toBe("night");
    expect(getTheme("day", "night")).toBe("day");
  });

  // 스크린샷 주소의 더하기 시간대와 잘못된 값을 구분한다.
  it("데모 URL을 안전하게 읽는다", () => {
    expect(getDemoTime("?at=2026-10-18T19:00+09:00")?.toISOString()).toBe(
      "2026-10-18T10:00:00.000Z",
    );
    expect(getDemoTime("?at=unknown")).toBeNull();
    expect(getDemoTheme("?theme=night")).toBe("night");
    expect(getDemoTheme("?theme=violet")).toBeNull();
  });
});
