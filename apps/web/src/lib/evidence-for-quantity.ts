// 발행 문장에서 수치를 인용한 근거만 원래 문장 순서대로 찾는다.
import type { Claim, Evidence } from "@crowdcast/contracts/types";

// 같은 근거가 여러 문장에 나와도 한 번만 보여 주며 누락된 근거는 만들지 않는다.
export function evidenceForQuantity(
  claims: readonly Claim[],
  evidence: readonly Evidence[],
  quantityId: string,
): Evidence[] {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const linked: Evidence[] = [];

  // 발행된 인용 문장의 evidenceIds 순서만 따라가야 숫자의 출처가 바뀌지 않는다.
  for (const claim of claims) {
    if (
      claim.status !== "published" ||
      !claim.placeholders.some((item) => item.quantityId === quantityId)
    )
      continue;
    for (const id of claim.evidenceIds) {
      const item = byId.get(id);
      if (item && !seen.has(id)) {
        linked.push(item);
        seen.add(id);
      }
    }
  }
  return linked;
}
