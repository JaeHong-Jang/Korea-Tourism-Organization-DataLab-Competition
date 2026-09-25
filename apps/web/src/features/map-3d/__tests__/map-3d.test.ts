// 실제 서울 타일로 건물·도로·열차 경로와 행사 기둥의 지도 연결을 확인한다.
import { readFileSync } from "node:fs";
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { VectorTile } from "@mapbox/vector-tile";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import Pbf from "pbf";
import { expect, it } from "vitest";
import card from "../../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import {
  BUILDING_EXTRUSION,
  FESTIVAL_COLUMNS,
  KOREA_BOUNDS,
  mapStyle,
} from "../../map-2d/map-style";
import { cityActorPlan, festivalShare } from "../city-actors";
import {
  columnHeight,
  festivalColumns,
  festivalRings,
} from "../festival-geometry";
import { actorScale, actorSeconds, vehiclePlan } from "../traffic-layer";
import {
  peopleCap,
  sampleRoute,
  trafficRoutes,
  vehicleCap,
} from "../traffic-routes";

const festival = card as FestivalSummary;
const colors = {
  levels: ["green", "gold", "coral", "red"],
  surface: "white",
  ink: "black",
  focus: "blue",
  earth: "beige",
  green: "forestgreen",
  water: "lightblue",
  road: "white",
  roadEdge: "gray",
  rail: "black",
  building: "silver",
  buildingRoof: "ivory",
  buildingWindow: "yellow",
};

// 높이 데이터가 있는 z15 타일과 낮·밤 한국어 스타일의 건물 돌출을 묶어 확인한다.
it("z15 서울의 건물과 한국어 낮·밤 3D 지도를 조립한다", () => {
  const bytes = readFileSync(
    new URL("../__fixtures__/seoul-27941-12689.mvt", import.meta.url),
  );
  const tile = new VectorTile(new Pbf(bytes));
  expect(tile.layers.buildings.length).toBeGreaterThan(100);
  expect(tile.layers.buildings.feature(0).properties.height).toBeGreaterThan(0);
  for (const theme of ["day", "night"] as const) {
    const style = mapStyle(theme, [festival], colors, "http://127.0.0.1:5184");
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.sources.protomaps).toMatchObject({
      url: "pmtiles://http://127.0.0.1:5184/tiles/korea-z15.pmtiles",
    });
    expect(JSON.stringify(style.layers)).toContain("name:ko");
    expect(style.layers.find((layer) => layer.id === "earth")).toMatchObject({
      paint: { "fill-color": colors.earth },
    });
    expect(style.layers.find((layer) => layer.id === "water")).toMatchObject({
      paint: { "fill-color": colors.water },
    });
    expect(
      style.layers.some(
        (layer) => layer.id === "places_country" || layer.id === "places_state",
      ),
    ).toBe(false);
    expect(style.layers.some((layer) => layer.id === "pois")).toBe(false);
    expect(
      style.layers.find((layer) => layer.id === "places_subplace"),
    ).toMatchObject({ minzoom: 13, paint: { "text-opacity": 0.42 } });
    expect(KOREA_BOUNDS[0][0]).toBeGreaterThan(125);
    expect(KOREA_BOUNDS[1][1]).toBeLessThan(39);
    expect(
      style.layers.find((layer) => layer.id === BUILDING_EXTRUSION),
    ).toMatchObject({
      type: "fill-extrusion",
      minzoom: 13,
      "source-layer": "buildings",
    });
    expect(
      style.layers.find((layer) => layer.id === FESTIVAL_COLUMNS),
    ).toMatchObject({
      type: "fill-extrusion",
      paint: { "fill-extrusion-height": ["get", "height"] },
    });
  }
});

// 예보가 커질수록 기둥은 높아지고 선택 원은 한 행사에만 붙는다.
it("기둥 높이와 등급, 선택 원을 예보값에서 만든다", () => {
  const small = { ...festival, eventId: "suwon-small", level: 1, peakP50: 900 };
  const large = {
    ...festival,
    eventId: "suwon-large",
    level: 4,
    peakP50: 12000,
  };
  const columns = festivalColumns([small, large]);
  expect(columns.features[0].properties?.height).toBeLessThan(
    columns.features[1].properties?.height,
  );
  expect(columns.features.map((feature) => feature.properties?.level)).toEqual([
    1, 4,
  ]);
  expect(columnHeight(1_000_000)).toBeLessThanOrEqual(130);
  expect(festivalRings([small, large], large.eventId).features).toHaveLength(1);
});

// 실제 도로·철도 타일은 보행로를 버리고 차량 상한과 정지 샘플을 지킨다.
it("실제 서울 선에서 차량·열차 경로를 만들고 품질 상한을 지킨다", () => {
  const bytes = readFileSync(
    new URL("../__fixtures__/seoul-27941-12689.mvt", import.meta.url),
  );
  const roads = new VectorTile(new Pbf(bytes)).layers.roads;
  const features = Array.from({ length: roads.length }, (_, index) =>
    roads.feature(index).toGeoJSON(27941, 12689, 15),
  );
  const routes = trafficRoutes(features);
  expect(routes.some((route) => route.kind === "road")).toBe(true);
  expect(routes.some((route) => route.kind === "rail")).toBe(true);
  expect(routes.some((route) => route.kind === "walk")).toBe(true);
  expect(vehicleCap("high")).toBe(600);
  expect(peopleCap("high")).toBe(2500);
  expect(vehiclePlan(routes, "medium")).toHaveLength(250);
  expect(vehiclePlan(routes, "low")).toHaveLength(0);
  expect(actorSeconds(5000, 1000, true)).toBe(0);
  expect(actorSeconds(5000, 1000, false)).toBe(4);
  expect(actorScale(15, 37.56, true) * 1.8).toBeGreaterThan(20);
  expect(actorScale(15, 37.56, false) * 2).toBeGreaterThan(12);
  expect(
    cityActorPlan(routes, "medium", null).filter(
      (actor) => actor.kind === "person",
    ),
  ).toHaveLength(1000);
  const small = cityActorPlan(routes, "medium", {
    lng: 126.98,
    lat: 37.56,
    peakP50: 1000,
  });
  const large = cityActorPlan(routes, "medium", {
    lng: 126.98,
    lat: 37.56,
    peakP50: 20000,
  });
  expect(festivalShare(20000)).toBeGreaterThan(festivalShare(1000));
  expect(festivalShare(20000, true)).toBeGreaterThan(festivalShare(20000));
  expect(large.filter((actor) => actor.gathering).length).toBeGreaterThan(
    small.filter((actor) => actor.gathering).length,
  );
  const output = { x: 0, y: 0, heading: 0 };
  expect(sampleRoute(routes[0], routes[0].length / 2, output)).toBe(output);
  const first = { ...output };
  sampleRoute(routes[0], routes[0].length / 2, output);
  expect(output).toEqual(first);
});
