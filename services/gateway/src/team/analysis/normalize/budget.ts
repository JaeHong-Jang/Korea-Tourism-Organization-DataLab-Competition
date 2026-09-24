// 행사 예산의 한국어 금액을 정수 원으로 정규화한다
// 천·백·십은 큰 단위 안의 계수로 계산하고 단위가 거꾸로 나오면 거부한다
function smallAmount(text: string): number | null {
  const parts = [...text.matchAll(/(\d+(?:\.\d+)?)(천|백|십)?/g)];
  if (parts.map((part) => part[0]).join("") !== text) return null;
  const units: Record<string, number> = { 천: 1_000, 백: 100, 십: 10 };
  let previous = Infinity;
  let total = 0;
  for (const part of parts) {
    const unit = units[part[2]] ?? 1;
    if (unit >= previous) return null;
    previous = unit;
    total += Number(part[1]) * unit;
  }
  return total;
}

// 한국어 큰 금액 단위를 정수 원으로 바꾸고 범위·음수·불명확한 금액은 보류한다
export function normalizeBudget(text: string | null): number | null {
  if (!text || /미정|미상|약|정도|~|-|부터|이상|이하/.test(text)) return null;
  const value = text.replace(/예산|총|은|는|이|가|원|[\s,]/g, "");
  const parts = value.match(/^(?:([^억만]+)억)?(?:([^억만]+)만)?([^억만]*)$/);
  if (!parts || !value) return null;
  const amounts = parts.slice(1).map((part) => (part ? smallAmount(part) : 0));
  if (amounts.some((part) => part === null)) return null;
  // 원 단위가 없는 '1억 5천'은 만을 생략한 관용 표기로 읽는다
  const omittedMan =
    parts[1] &&
    !parts[2] &&
    /^\d+(?:\.\d+)?천$/.test(parts[3]) &&
    !/원/.test(text);
  const total =
    (amounts[0] ?? 0) * 100_000_000 +
    (amounts[1] ?? 0) * 10_000 +
    (amounts[2] ?? 0) * (omittedMan ? 10_000 : 1);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}
