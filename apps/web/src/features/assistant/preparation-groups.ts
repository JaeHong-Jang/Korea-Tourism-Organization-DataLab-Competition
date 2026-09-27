// 서버가 제안한 준비 항목의 원문을 유지하면서 업무별로 묶는다.
export type PreparationAction = { id: string; label: string; href?: string };
const categories: [string, RegExp][] = [
  ["수용인원·입장 관리", /수용|입장|대기/],
  ["교통·주차 대책", /교통|주차/],
  ["우천·대피 준비", /우천|대피/],
  ["안전요원 배치", /요원/],
  ["비상 대응 체계", /조직도|상황실|연락망|대책본부|유관기관/],
  ["인파·동선 관리", /밀집|동선|출입구|병목/],
];

// 같은 문장은 한 번만 표시하며 분류되지 않은 권고도 빠뜨리지 않는다.
export function preparationGroups(actions: PreparationAction[]) {
  const groups = new Map<string, PreparationAction[]>();
  const seen = new Set<string>();
  for (const action of actions) {
    if (action.href || seen.has(action.label)) continue;
    seen.add(action.label);
    const title =
      categories.find(([, pattern]) => pattern.test(action.label))?.[0] ??
      "기타 준비 사항";
    groups.set(title, [...(groups.get(title) ?? []), action]);
  }
  return [...groups].map(([title, items]) => ({ title, items }));
}
