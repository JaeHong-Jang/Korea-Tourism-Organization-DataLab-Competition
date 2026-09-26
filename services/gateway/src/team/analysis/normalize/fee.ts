// 요금 문구를 계약의 무료·유료·미상 값으로 정리한다
import type { EventDraft } from "@crowdcast/contracts/types";

// 무료와 별도 유료 프로그램이 함께 있으면 요금 확인이 필요한 유료로 분류한다
export function normalizeFee(text: string | null): EventDraft["fee"] {
  if (!text) return null;
  if (/미정|미상|추후|아직|모름/.test(text)) return "미상";
  if (/유료|별도|부분\s*유료/.test(text)) return "유료";
  const amounts = [...text.matchAll(/([\d,.]+)\s*(만|천)?\s*원/g)];
  if (amounts.some((match) => Number(match[1].replace(/,/g, "")) > 0))
    return "유료";
  if (/무료|입장료\s*없|돈을?\s*받지/.test(text) || amounts.length > 0)
    return "무료";
  return null;
}
