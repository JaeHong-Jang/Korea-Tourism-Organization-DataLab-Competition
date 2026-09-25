// 타일 속성(태그) 해석 — 역 이름 거르기·건물 높이·장난감 길 폭·토지이용 구역 종류.
import type { VenueZone } from "./tiles";

// 역 이름만 있는 POI와 출입구·승강기 이름은 철도역 목록에서 제외한다.
export function isStationName(name: string): boolean {
  const normalized = name.trim();
  return (
    normalized.length > 1 &&
    normalized !== "역" &&
    !/엘리베이터|출입구|출구|입구|승강기/i.test(normalized)
  );
}

// 높이 태그가 없을 때 층수 또는 건물 종류의 낮은 기본값을 쓰고 상한을 둔다.
export function buildingHeight(
  properties: Record<string, unknown>,
): [number, number] {
  const numeric = (value: unknown) =>
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  const levels = numeric(properties["building:levels"] ?? properties.levels);
  const stated = numeric(properties.height);
  const height =
    Number.isFinite(stated) && stated > 0
      ? stated
      : Number.isFinite(levels) && levels > 0
        ? levels * 3.2
        : properties.kind_detail === "garage"
          ? 3
          : 9;
  const min = numeric(properties.min_height);
  return [
    Math.min(100, Math.max(2.5, height)),
    Number.isFinite(min) ? Math.max(0, Math.min(min, height - 1)) : 0,
  ];
}

// 도로 분류는 실제 노폭이 아니므로 장난감 길 폭만 정한다.
export function roadWidth(kind: string): number {
  return kind === "major_road" ? 8 : kind === "minor_road" ? 5 : 2.5;
}

// 토지이용 종류를 건물 종류 추정용 구역으로 묶는다(나머지는 버림).
export const ZONE_KINDS: Record<string, VenueZone["kind"]> = {
  residential: "residential",
  commercial: "commercial",
  retail: "commercial",
  school: "school",
  kindergarten: "school",
  university: "school",
  college: "school",
  hospital: "school",
  industrial: "industrial",
};
