// 원문에 명시된 단일 계약 유형어만 받아쓰기의 빈 유형에 보완한다
import type { EventDraft } from "@crowdcast/contracts/types";

export const TYPE_KEYWORDS = [
  "불꽃",
  "공연",
  "대학",
  "먹거리",
  "꽃",
  "전통",
] as const;

// 불꽃 안의 꽃은 별도 유형으로 세지 않고 서로 다른 유형이 있으면 되묻는다
export function explicitType(text: string): EventDraft["type"] {
  const matches = TYPE_KEYWORDS.filter((word) =>
    (word === "꽃" ? text.replaceAll("불꽃", "") : text).includes(word),
  );
  return matches.length === 1 ? matches[0] : null;
}
