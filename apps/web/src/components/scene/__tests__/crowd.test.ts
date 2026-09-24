// 군중 축척·배치·색과 모형·이름표의 결정성을 검증한다.
import { describe, expect, test } from "vitest";
import { sceneFestivals } from "../__fixtures__/festivals";
import { buildDollLayout, dollColorIndex } from "../crowd/doll-layout";
import { crowdScale } from "../crowd-scale";
import { modelForType } from "../festival-models";
import { placeFestivals } from "../festival-models/placement";
import { visibleTagIds } from "../name-tag";

// 품질 상한과 목록 전체의 단일 축척을 함께 확인한다.
describe("군중 축척", () => {
  test.each([
    ["high", 2000],
    ["medium", 1000],
    ["low", 500],
  ] as const)("%s 상한", (quality, maximum) => {
    const result = crowdScale(sceneFestivals, quality);
    expect(result.total).toBeLessThanOrEqual(maximum);
    expect(result.counts).toHaveLength(30);
    expect(result.counts.every((count) => count >= 1)).toBe(true);
    expect(
      [1, 2, 5].includes(
        result.peoplePerDoll /
          10 ** Math.floor(Math.log10(result.peoplePerDoll)),
      ),
    ).toBe(true);
  });

  // 입력 순서가 같으면 축척과 반올림 결과가 같다.
  test("동일 입력은 동일한 축척을 준다", () => {
    expect(crowdScale(sceneFestivals, "high")).toEqual(
      crowdScale(sceneFestivals, "high"),
    );
    expect(
      crowdScale([{ ...sceneFestivals[0], peakP50: 0 }], "low").counts,
    ).toEqual([1]);
  });
});

// 화면에 쓰는 인스턴스 행렬과 색 번호를 같은 데이터에서 재현한다.
test("인형 행렬과 토큰 색은 결정적이다", () => {
  const placed = placeFestivals(sceneFestivals);
  const counts = crowdScale(
    placed.map(({ festival }) => festival),
    "high",
  ).counts;
  const first = buildDollLayout(placed, counts);
  const second = buildDollLayout(placed, counts);
  expect(first.map(({ matrix }) => matrix.elements)).toEqual(
    second.map(({ matrix }) => matrix.elements),
  );
  expect(first[0].matrix.elements[13]).toBeCloseTo(9.55);
  expect(
    first.every(({ colorIndex }) => colorIndex >= 0 && colorIndex < 8),
  ).toBe(true);
  expect(dollColorIndex("sample-event-1", 5)).toBe(
    dollColorIndex("sample-event-1", 5),
  );
});

// 계약의 기타 유형까지 일곱 모형이 고유 컴포넌트로 연결된다.
test("모든 행사 유형에 모형이 있다", () => {
  const types = [
    "불꽃",
    "공연",
    "먹거리",
    "꽃",
    "대학",
    "전통",
    "기타",
  ] as const;
  expect(new Set(types.map(modelForType)).size).toBe(7);
});

// 겹친 이름표는 높은 등급을 남기고 같은 등급은 ID 순서를 따른다.
test("이름표 겹침은 등급 우선이다", () => {
  expect(
    visibleTagIds([
      { id: "low", level: 1, x: 10, y: 10 },
      { id: "high", level: 4, x: 12, y: 12 },
      { id: "elsewhere", level: 2, x: 200, y: 200 },
    ]),
  ).toEqual(["high", "elsewhere"]);
});

// 행사 수가 상한보다 많아 최소 한 개 규칙이 우선하면 이를 명시한다.
test("상한을 넘는 최소 인형 수를 알린다", () => {
  const many = Array.from({ length: 501 }, (_, index) => ({
    ...sceneFestivals[0],
    eventId: `sample-${index}`,
    peakP50: 0,
  }));
  const result = crowdScale(many, "low");
  expect(result.total).toBe(501);
  expect(result.capExceeded).toBe(true);
});

// 같은 좌표의 두 행사도 다른 인형과 몸통 간격을 유지한다.
test("같은 좌표의 군중은 서로 겹치지 않는다", () => {
  const first = { festival: sceneFestivals[0], x: 0, z: 0 };
  const second = { festival: sceneFestivals[1], x: 0, z: 0 };
  const instances = buildDollLayout([first, second], [100, 100]);
  const points = instances.map(({ matrix }) => [
    matrix.elements[12],
    matrix.elements[14],
  ]);
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const separation = Math.hypot(
        points[i][0] - points[j][0],
        points[i][1] - points[j][1],
      );
      expect(separation).toBeGreaterThanOrEqual(0.9 - 1e-5);
    }
});

// 실제 48px 이름표는 세로 40px 차이에서도 높은 등급만 남는다.
test("이름표 실제 높이와 먼 시점의 최대 수를 지킨다", () => {
  expect(
    visibleTagIds([
      { id: "high", level: 4, x: 10, y: 10 },
      { id: "low", level: 1, x: 10, y: 50 },
    ]),
  ).toEqual(["high"]);
  const separate = Array.from({ length: 10 }, (_, index) => ({
    id: String(index),
    level: 4,
    x: index * 120,
    y: 0,
  }));
  expect(visibleTagIds(separate, true)).toHaveLength(6);
});
