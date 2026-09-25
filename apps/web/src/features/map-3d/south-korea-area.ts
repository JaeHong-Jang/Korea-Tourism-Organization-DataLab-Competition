// 남한 지명만 남기도록 지도 라벨의 대략적인 공간 경계를 정의한다.
export const SOUTH_KOREA_LABEL_AREA = {
  type: "Polygon" as const,
  coordinates: [
    [
      [125.0, 32.7],
      [127.0, 32.7],
      [128.6, 34.1],
      [129.0, 34.8],
      [129.5, 35.2],
      [129.5, 36.5],
      [130.1, 37.5],
      [129.8, 38.7],
      [128.3, 38.7],
      [127.0, 38.2],
      [125.7, 37.9],
      [125.0, 35.5],
      [125.0, 32.7],
    ],
  ],
};
// Protomaps의 옛 분류 필터를 식으로 옮긴 뒤 남한 영역과 교집합을 구한다.
export function southKoreanLabelFilter(filter: unknown) {
  let kindFilter = filter;
  if (Array.isArray(filter) && typeof filter[1] === "string") {
    if (filter[0] === "in")
      kindFilter = ["in", ["get", filter[1]], ["literal", filter.slice(2)]];
    if (filter[0] === "==") kindFilter = ["==", ["get", filter[1]], filter[2]];
  }
  return kindFilter
    ? ["all", kindFilter, ["within", SOUTH_KOREA_LABEL_AREA]]
    : ["within", SOUTH_KOREA_LABEL_AREA];
}
