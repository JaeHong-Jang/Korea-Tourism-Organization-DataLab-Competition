// 한국어 로컬 지도 스타일과 등급 토큰 연결을 확인한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import card from "../../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import { FESTIVAL_POINTS, FESTIVAL_SOURCE, mapStyle } from "../map-style";

const colors = {
  levels: ["level-one", "level-two", "level-three", "level-four"],
  surface: "surface-token",
  ink: "ink-token",
  focus: "focus-token",
};

// 낮·밤 배경 모두 타일·글꼴·스프라이트를 같은 출처에서 읽는다.
it("낮·밤에서 로컬 한국어 베이스맵과 등급 토큰을 조립한다", () => {
  const festival = card as FestivalSummary;
  const day = mapStyle("day", [festival], colors, "http://127.0.0.1:5184");
  const night = mapStyle("night", [festival], colors, "http://127.0.0.1:5184");
  expect(day.sources.protomaps).toMatchObject({
    url: "pmtiles://http://127.0.0.1:5184/tiles/korea-z13.pmtiles",
  });
  expect(day.glyphs).toBe("/tiles/fonts/{fontstack}/{range}.pbf");
  expect(day.sprite).toBe("/tiles/sprites/v4/light");
  expect(night.sprite).toBe("/tiles/sprites/v4/dark");
  expect(day.layers).not.toEqual(night.layers);
  expect(JSON.stringify(day.layers)).toContain("name:ko");
  expect(day.sources[FESTIVAL_SOURCE]).toMatchObject({ cluster: true });
  const points = day.layers.find((layer) => layer.id === FESTIVAL_POINTS);
  expect(points?.type).toBe("circle");
  expect(
    points?.type === "circle" ? points.paint?.["circle-color"] : null,
  ).toEqual([
    "match",
    ["get", "level"],
    1,
    "level-one",
    2,
    "level-two",
    3,
    "level-three",
    4,
    "level-four",
    "level-one",
  ]);
});
