// 고래 좌표의 저장·복원과 화면 경계 제한을 확인한다.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampWhale,
  dragWhale,
  nudgeWhale,
  rememberWhale,
  restoreWhale,
  spotlightPlacement,
} from "./whale-position";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// 저장한 위치가 새 창에서 복원되고 화면 밖 좌표는 가장자리로 옮긴다.
it("위치를 기억하고 창 안으로 제한한다", () => {
  const size = { width: 92, height: 100 };
  rememberWhale({ x: 120, y: 200 });
  expect(restoreWhale(size)).toEqual({ x: 120, y: 200 });
  expect(clampWhale({ x: -50, y: 9999 }, size)).toEqual({
    x: 0,
    y: window.innerHeight - 100,
  });
});

// 드래그와 키보드 이동은 같은 화면 경계를 지키고 작은 떨림은 클릭으로 남긴다.
it("포인터와 키보드 이동을 화면 안으로 제한한다", () => {
  const size = { width: 92, height: 100 };
  expect(
    dragWhale({ x: 200, y: 200 }, { x: 10, y: 10 }, { x: 12, y: 12 }, size),
  ).toEqual({ x: 200, y: 200 });
  expect(
    dragWhale({ x: 200, y: 200 }, { x: 10, y: 10 }, { x: -500, y: 10 }, size),
  ).toEqual({ x: 0, y: 200 });
  expect(nudgeWhale({ x: 200, y: 200 }, "ArrowRight", size)).toEqual({
    x: 216,
    y: 200,
  });
  expect(nudgeWhale({ x: 0, y: 0 }, "ArrowLeft", size)).toEqual({ x: 0, y: 0 });
});

// 저장소 사용이 거절되어도 기본 위치를 계산한다.
it("저장소 예외가 이동을 막지 않는다", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("denied");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  expect(() => rememberWhale({ x: 1, y: 2 })).not.toThrow();
  expect(restoreWhale({ width: 92, height: 100 })).toEqual({
    x: window.innerWidth - 112,
    y: window.innerHeight - 120,
  });
});

// 고른 행사 카드는 고래 바로 아래(없으면 위)에 가운데 맞추고 화면 안에 둔다.
describe("고래에 붙은 행사 카드", () => {
  const whale = { width: 92, height: 100 };
  const card = { width: 300, height: 270 };
  const viewport = { width: 1440, height: 900 };
  it("아래 공간이 있으면 아래, 없으면 위에 둔다", () => {
    expect(
      spotlightPlacement({ x: 460, y: 100 }, whale, card, viewport),
    ).toEqual({
      left: 356,
      top: 210,
      side: "below",
      arrow: 150,
    });
    const low = spotlightPlacement({ x: 1328, y: 780 }, whale, card, viewport);
    expect(low.side).toBe("above");
    expect(low.top).toBe(780 - 10 - 270);
    expect(low.left).toBe(1440 - 300 - 8);
    expect(low.arrow).toBe(1328 + 46 - low.left);
  });
  it("화면 왼쪽 끝에서도 카드가 밖으로 나가지 않고 꼬리는 16px 안쪽", () => {
    const edge = spotlightPlacement({ x: 0, y: 50 }, whale, card, viewport);
    expect(edge.left).toBe(8);
    expect(edge.arrow).toBe(38);
  });
});
