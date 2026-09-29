// 상세 패널의 따라오기 위치가 목록 영역 위·아래 경계를 지키는지 확인한다.
import { expect, it } from "vitest";
import { followOffset } from "./use-follow-scroll";

// 목록이 아직 화면 아래에 있으면 패널은 제자리에 있다.
it("목록 위쪽이 보이면 움직이지 않는다", () => {
  expect(followOffset(120, 3000, 800)).toBe(0);
});

// 목록을 내린 만큼 패널이 따라 내려오고 위쪽에 16px 여백을 둔다.
it("내린 만큼 따라오고 위쪽 여백을 둔다", () => {
  expect(followOffset(-1000, 3000, 800)).toBe(1016);
});

// 목록 바닥을 넘지 않게 따라오는 거리를 자른다.
it("목록 바닥을 넘지 않는다", () => {
  expect(followOffset(-2900, 3000, 800)).toBe(2200);
  expect(followOffset(-500, 600, 800)).toBe(0);
});
