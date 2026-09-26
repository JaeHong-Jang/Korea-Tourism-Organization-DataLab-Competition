// 전국 판 투영이 노트북과 큰 화면에서 패널을 피하는지 확인한다.
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { overviewPose } from "../camera-framing";
import type { PanelBounds } from "../scene-panel-bounds";

// 카메라가 계산한 안전 영역에 판의 네 모서리가 모두 들어오는지 검증한다.
describe("전국 보기 구도", () => {
  it.each([
    { width: 1440, height: 784, listLeft: 1048, timelineTop: 580 },
    { width: 1280, height: 684, listLeft: 888, timelineTop: 480 },
  ])("$width×$height에서 패널을 피해 판을 담는다", (layout) => {
    const bounds: PanelBounds = {
      width: layout.width,
      height: layout.height,
      blockers: [
        { left: 32, top: 32, right: 332, bottom: layout.height - 16 },
        {
          left: layout.listLeft,
          top: 32,
          right: layout.width - 32,
          bottom: layout.height - 32,
        },
        {
          left: 352,
          top: layout.timelineTop,
          right: layout.listLeft - 20,
          bottom: layout.height - 16,
        },
        {
          left: layout.width / 2 - 75,
          top: 32,
          right: layout.width / 2 + 75,
          bottom: 72,
        },
        { left: 352, top: 32, right: 448, bottom: 70 },
      ],
    };
    const pose = overviewPose(bounds, [0, 0], 600, 900, 44);
    const camera = new PerspectiveCamera(
      44,
      bounds.width / bounds.height,
      10,
      5000,
    );
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    camera.updateMatrixWorld();
    for (const x of [-300, 300]) {
      for (const z of [-450, 450]) {
        const point = new Vector3(x, 8, z).project(camera);
        const screenX = ((point.x + 1) * bounds.width) / 2;
        const screenY = ((1 - point.y) * bounds.height) / 2;
        expect(screenX).toBeGreaterThanOrEqual(pose.safe.left);
        expect(screenX).toBeLessThanOrEqual(pose.safe.right);
        expect(screenY).toBeGreaterThanOrEqual(pose.safe.top);
        expect(screenY).toBeLessThanOrEqual(pose.safe.bottom);
      }
    }
  });
});
