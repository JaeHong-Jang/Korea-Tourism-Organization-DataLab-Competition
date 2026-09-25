// 이름표의 클릭 영역이 화면 경계와 떠 있는 패널을 침범하지 않는지 확인한다.
import { describe, expect, it } from "vitest";
import { tagFitsSafeArea } from "../tag-visibility";

describe("장면 이름표의 안전 영역", () => {
  // 화면 끝에서 절반만 보이거나 패널 아래에 가려진 이름표는 클릭 표면에서 뺀다.
  it("전체 버튼이 화면 안에 있고 패널과 떨어져야 표시한다", () => {
    const panels = [
      { left: 20, top: 20, right: 320, bottom: 430 },
      { left: 1080, top: 20, right: 1420, bottom: 620 },
      { left: 350, top: 640, right: 1040, bottom: 860 },
    ];
    expect(tagFitsSafeArea(720, 380, 158, 48, 1440, 900, panels)).toBe(true);
    expect(tagFitsSafeArea(720, 12, 158, 48, 1440, 900, panels)).toBe(false);
    expect(tagFitsSafeArea(320, 380, 158, 48, 1440, 900, panels)).toBe(false);
    expect(tagFitsSafeArea(720, 650, 158, 48, 1440, 900, panels)).toBe(false);
  });
});
