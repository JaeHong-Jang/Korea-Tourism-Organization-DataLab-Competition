// 예보서에 발행된 근거의 고정 순서에서 카드와 칩이 같은 번호를 찾는다.
import type { Evidence } from "@crowdcast/contracts/types";

// 참조 대상이 번호표에 없으면 잘못된 근거 연결로 돌려준다.
export function evidenceNumber(
  id: string,
  evidenceOrder: readonly Evidence[],
): number | null {
  const index = evidenceOrder.findIndex((item) => item.id === id);
  return index < 0 ? null : index + 1;
}
