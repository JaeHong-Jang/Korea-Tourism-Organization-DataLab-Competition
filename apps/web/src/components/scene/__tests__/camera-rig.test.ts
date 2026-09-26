// 방향키가 장면 포커스에서만 카메라에 전달되는지 검증한다.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isSceneCameraKey } from "../camera-rig";

// 이벤트 표적과 포커스를 실제 DOM에서 만들어 키 충돌 조건을 확인한다.
describe("장면 카메라 방향키", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("장면에 직접 포커스했을 때만 처리한다", () => {
    const stage = document.createElement("section");
    stage.tabIndex = 0;
    const button = document.createElement("button");
    const input = document.createElement("input");
    const list = document.createElement("ol");
    stage.append(button, input);
    document.body.append(stage, list);
    const key = (target: Element) => {
      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event;
    };
    stage.focus();
    expect(isSceneCameraKey(key(stage), stage)).toBe(true);
    button.focus();
    expect(isSceneCameraKey(key(button), stage)).toBe(false);
    input.focus();
    expect(isSceneCameraKey(key(input), stage)).toBe(false);
    expect(isSceneCameraKey(key(list), stage)).toBe(false);
    stage.focus();
    const handled = key(stage);
    handled.preventDefault();
    expect(isSceneCameraKey(handled, stage)).toBe(false);
  });
});
