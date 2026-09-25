// 관광지 집중률 비교 문장과 한국 날짜 자르기를 확인한다.
import { describe, expect, it } from "vitest";
import { koreaDate } from "../../lib/use-concentration";
import { compareToWindow } from "./report-concentration";

describe("관광지 집중률 카드", () => {
  it("행사 기간 평균을 30일 평균과 견준다(±5 안은 비슷)", () => {
    expect(compareToWindow(58.4, 61.5)).toBe("30일 평균과 비슷해요");
    expect(compareToWindow(80, 61.5)).toBe("30일 평균보다 18.5 높아요");
    expect(compareToWindow(40, 61.5)).toBe("30일 평균보다 21.5 낮아요");
  });

  it("UTC 자정 전후 시각을 한국 날짜로 자른다", () => {
    expect(koreaDate("2026-10-01T00:00:00+09:00")).toBe("2026-10-01");
    expect(koreaDate("2026-09-30T16:00:00Z")).toBe("2026-10-01");
    expect(koreaDate("2026-10-04T23:59:59+09:00")).toBe("2026-10-04");
  });
});
