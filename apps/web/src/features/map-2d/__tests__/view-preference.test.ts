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
it("2D 보기 선택을 기억하고 주소로 덮어쓴다", () => {
  expect(preferredView("")).toBe("3d");
  rememberView("2d");
  expect(preferredView("")).toBe("2d");
  expect(preferredView("?view=3d")).toBe("3d");
  expect(preferredView("?view=2d")).toBe("2d");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("저장소 차단");
  });
  expect(preferredView("")).toBe("3d");
});
