// 시도 별칭과 일괄 예보의 시군구 이름을 사용해 지역 조건을 고른다
import type { FestivalSummary } from "@crowdcast/contracts/types";

// 행정구역 코드 개편 전후 요약을 같은 시도로 취급한다
const provinces = [
  ["서울", "서울특별시", "11"],
  ["부산", "부산광역시", "26"],
  ["대구", "대구광역시", "27"],
  ["인천", "인천광역시", "28"],
  ["광주", "광주광역시", "29"],
  ["대전", "대전광역시", "30"],
  ["울산", "울산광역시", "31"],
  ["세종", "세종특별자치시", "36"],
  ["경기", "경기도", "41"],
  ["강원", "강원도|강원특별자치도", "42|51"],
  ["충북", "충청북도", "43"],
  ["충남", "충청남도", "44"],
  ["전북", "전라북도|전북특별자치도", "45|52"],
  ["전남", "전라남도", "46"],
  ["경북", "경상북도", "47"],
  ["경남", "경상남도", "48"],
  ["제주", "제주도|제주특별자치도", "50"],
];

// 지명 뒤 조사만 허용해 광주와 광주시·진주와 진주성을 혼동하지 않는다
function mentionPosition(text: string, name: string): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|[\\s,])${escaped}(?=$|[\\s,]|에서|으로|에|로|의|쪽)`,
  ).exec(text);
  return match?.index ?? Number.POSITIVE_INFINITY;
}

// 결과가 없는 지역도 조건을 버리지 않고 같은 시도 코드 범위에 머물게 한다
export function recommendationRegion(
  text: string,
  festivals: FestivalSummary[],
) {
  const province = provinces
    .map((entry) => ({
      entry,
      at: Math.min(
        ...[entry[0], ...entry[1].split("|")].map((name) =>
          mentionPosition(text, name),
        ),
      ),
    }))
    .filter(({ at }) => Number.isFinite(at))
    .sort((left, right) => left.at - right.at)[0]?.entry;
  const prefixes = province?.[2].split("|");
  const eligible = festivals.filter(
    (item) =>
      !prefixes ||
      prefixes.some((prefix) => item.sigunguCode.startsWith(prefix)),
  );
  const districts = eligible.filter((item) => {
    const names = item.sigunguName
      .split(/\s+/)
      .filter(
        (name) =>
          !provinces.some(([short, aliases]) =>
            [short, ...aliases.split("|")].includes(name),
          ),
      );
    return names.some(
      (name) =>
        Number.isFinite(mentionPosition(text, name)) ||
        (name.length > 2 &&
          /[시군구]$/.test(name) &&
          Number.isFinite(mentionPosition(text, name.slice(0, -1)))),
    );
  });
  const codes = districts.length
    ? new Set(districts.map((item) => item.sigunguCode))
    : null;
  const sido =
    province?.[0] ??
    (codes
      ? (provinces.find((entry) =>
          entry[2]
            .split("|")
            .some((prefix) => districts[0].sigunguCode.startsWith(prefix)),
        )?.[0] ?? null)
      : null);
  return {
    sido,
    label: codes
      ? [...new Set(districts.map((item) => item.sigunguName))].join("·")
      : sido,
    // 두 조건이 주어지면 교집합으로 제한하고 원본 요약은 바꾸지 않는다
    matches(item: FestivalSummary) {
      return (
        (!prefixes ||
          prefixes.some((prefix) => item.sigunguCode.startsWith(prefix))) &&
        (!codes || codes.has(item.sigunguCode))
      );
    },
  };
}
