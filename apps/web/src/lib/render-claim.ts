// 발행 문장의 자리표시자 수치에만 천 단위 쉼표를 더한다.
import type { Claim } from "@crowdcast/contracts/types";
import { formatSnapshotNumber } from "./format";

type ClaimQuantity = {
  id: string;
  value?: number | null;
  p10?: number | null;
  p50?: number | null;
  p90?: number | null;
};

// 상담에는 수치 카드가 없어도 검증된 렌더 문장의 자리표시자 위치만 바꾼다.
export function renderClaim(
  claim: Claim,
  quantities?: ClaimQuantity[],
): string {
  const rendered = claim.rendered ?? claim.text;
  if (!claim.placeholders.length) return rendered;

  // 예보서는 수치 ID를 찾아 원본 숫자를 쓰고, 상담은 렌더 결과의 같은 칸만 찾는다.
  if (quantities) {
    let text = claim.text;
    for (const placeholder of claim.placeholders) {
      const value = quantities.find(
        (item) => item.id === placeholder.quantityId,
      )?.[placeholder.field];
      if (value == null) return "수치 자료 없음";
      text = text.replaceAll(
        `{{${placeholder.name}}}`,
        formatSnapshotNumber(value),
      );
    }
    return text;
  }

  // 자리표시자 양옆의 원문이 일치할 때만 해당 숫자를 바꿔 날짜·연도를 보존한다.
  const parts = claim.text.split(/\{\{[^{}]+\}\}/g);
  const names = [...claim.text.matchAll(/\{\{([^{}]+)\}\}/g)].map(
    (match) => match[1],
  );
  if (names.length !== claim.placeholders.length) return rendered;
  if (
    names.some(
      (name) =>
        !claim.placeholders.some((placeholder) => placeholder.name === name),
    )
  )
    return rendered;
  const pattern = new RegExp(
    `^${parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(-?\\d+(?:\\.\\d+)?)")}$`,
  );
  const matched = rendered.match(pattern);
  if (!matched) return rendered;
  return parts.reduce(
    (text, part, index) =>
      text +
      (index ? matched[index].replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "") +
      part,
    "",
  );
}
