// 역 좌표와 왕복 연출의 결정성·품질 상한·정지 설정을 검증한다.
import { describe, expect, it } from "vitest";
import { projectKorea } from "../../projection";
import {
  type MotionPoint,
  motionSeconds,
  railLines,
  routePosition,
} from "../rail-lines";
import { roadTrafficCap } from "../road-traffic";

describe("전국 판 이동 연출", () => {
  // 모든 경로의 주요 역은 기존 전국 판과 동일한 투영을 쓴다.
  it("공개 역 좌표를 전국 판으로 투영한다", () => {
    expect(railLines.map((line) => line.name)).toEqual([
      "경부 KTX",
      "호남 KTX",
      "강릉 KTX",
    ]);
    expect(railLines[0].points[0]).toEqual(projectKorea(126.9707, 37.5547));
    expect(railLines[0].points.at(-1)).toEqual(projectKorea(129.0435, 35.1151));
    expect(railLines.every((line) => line.length > 100)).toBe(true);
  });

  // 같은 시각과 왕복 주기는 프레임 순서와 무관하게 같은 위치를 준다.
  it("왕복 위치가 결정적이고 끝에서 되돌아온다", () => {
    const line = railLines[0];
    const point: MotionPoint = { x: 0, z: 0, heading: 0 };
    const first = { ...routePosition(line, 25, 3.5, 0, point) };
    expect({ ...routePosition(line, 25, 3.5, 0, point) }).toEqual(first);
    expect(
      routePosition(line, 25 + (line.length * 2) / 3.5, 3.5, 0, point).x,
    ).toBeCloseTo(first.x);
    const end = { ...routePosition(line, line.length / 3.5, 3.5, 0, point) };
    expect(end.x).toBeCloseTo(line.points.at(-1)?.[0] ?? 0);
    expect(
      routePosition(line, line.length / 3.5 + 1, 3.5, 0, point).x,
    ).not.toBeCloseTo(end.x);
  });

  // 낮음 단계는 차량을 완전히 끄고 움직임 줄이기는 시각을 고정한다.
  it("품질별 차량 수와 움직임 줄이기를 제한한다", () => {
    expect([
      roadTrafficCap("high"),
      roadTrafficCap("medium"),
      roadTrafficCap("low"),
    ]).toEqual([120, 60, 0]);
    expect(motionSeconds(12, true)).toBe(0);
    expect(motionSeconds(99, true)).toBe(0);
    expect(motionSeconds(12, false)).toBe(12);
    const point: MotionPoint = { x: 0, z: 0, heading: 0 };
    const stopped = {
      ...routePosition(railLines[0], motionSeconds(12, true), 3.5, 0, point),
    };
    expect({
      ...routePosition(railLines[0], motionSeconds(99, true), 3.5, 0, point),
    }).toEqual(stopped);
  });
});
