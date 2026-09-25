// 장면 도구가 필터와 행사 목록 사이의 빈 곳을 찾는지 확인한다.
import { expect, it } from "vitest";
import { sceneToolPosition } from "../scene-tool-placement";

// 1366 화면의 목록을 피하고 좁은 화면에서는 아래줄로 내려간다.
it("떠 있는 패널을 피해 도구를 배치한다", () => {
  const position = sceneToolPosition(
    {
      width: 1366,
      height: 650,
      blockers: [
        { left: 32, top: 32, right: 332, bottom: 630 },
        { left: 975, top: 32, right: 1334, bottom: 600 },
        { left: 697, top: 32, right: 818, bottom: 70 },
      ],
    },
    240,
    50,
  );
  expect(position.left).toBeGreaterThanOrEqual(332);
  expect(position.left + 240).toBeLessThanOrEqual(975);
  const mobile = sceneToolPosition(
    {
      width: 390,
      height: 420,
      blockers: [{ left: 16, top: 16, right: 374, bottom: 58 }],
    },
    240,
    50,
  );
  expect(mobile.top).toBeGreaterThanOrEqual(58);
});
