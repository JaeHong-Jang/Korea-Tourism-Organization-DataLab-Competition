// 지도 보기 주소와 브라우저 저장값의 우선순위를 확인한다.
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { preferredView, rememberView } from "../view-preference";

// 테스트마다 이전 탭의 보기 설정을 지운다.
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// URL 선택은 저장값에 우선하고 저장소 차단 중에도 3D로 안전하게 연다.
it("실제 지도를 기본으로 열고 저장값과 기존 주소를 복원한다", () => {
  expect(preferredView("")).toBe("map");
  rememberView("top");
  expect(preferredView("")).toBe("top");
  expect(preferredView("?view=3d")).toBe("miniature");
  expect(preferredView("?view=2d")).toBe("top");
  expect(preferredView("?view=map")).toBe("map");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("저장소 차단");
  });
  expect(preferredView("")).toBe("map");
});
