// 게이트웨이 숫자 가드를 가져오지 않고 발행 원문·카드·근거 참조를 독립 검산한다
import type { Claim, Evidence, ForecastCard } from "@crowdcast/contracts/types";

const numeric = /[+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
const slot = /\{\{([a-z][a-z0-9_]*)\}\}/g;

// 렌더 문자열의 리터럴 부분까지 일치시키도록 정규식 특수문자를 이스케이프한다
function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 인용 규칙의 완전한 문구만 예외로 인정하고 입력 JSON에 붙은 숫자는 제외한다
function isRuleQuote(
  text: string,
  claim: Claim,
  evidence: Evidence[],
): boolean {
  return evidence.some(
    (item) =>
      item.kind === "rule" &&
      claim.evidenceIds.includes(item.id) &&
      [item.title, item.summary.split(" 입력:")[0]].some(
        (source) =>
          source.replace(/^(?:법정|자체) 기준\s*—\s*/, "").trim() ===
          text.trim(),
      ),
  );
}

// 각 자리표시자를 실제 렌더 숫자에 대응시켜 필드 교환·수치 삽입·단위 변조를 잡는다
export function auditClaimNumbers(
  claim: Claim,
  card: ForecastCard | null,
  evidence: Evidence[],
) {
  const problems: string[] = [];
  const rendered = claim.rendered;
  const tokens = [...(rendered ?? "").matchAll(numeric)];
  if (rendered === null)
    return { problems: ["rendered가 없습니다"], numericTokens: 0 };
  const slots = [...claim.text.matchAll(slot)];
  const literal = claim.text.replace(slot, "");
  if (/[{}]/.test(literal) || /\p{N}/u.test(rendered.replace(numeric, "")))
    problems.push("해석할 수 없는 숫자·자리표시자 표기");
  if (
    /\p{N}/u.test(literal) &&
    !(slots.length === 0 && isRuleQuote(claim.text, claim, evidence))
  )
    problems.push("규칙 인용 외 리터럴 숫자");
  const bindings = new Map(
    claim.placeholders.map((binding) => [binding.name, binding]),
  );
  if (
    bindings.size !== claim.placeholders.length ||
    [...bindings.keys()].some(
      (name) => !slots.some((match) => match[1] === name),
    )
  )
    problems.push("중복되거나 사용하지 않은 수치 바인딩");

  // 숫자만 캡처하고 나머지 렌더 문구는 템플릿과 정확히 같아야 한다
  let expression = "^";
  let cursor = 0;
  for (const match of slots) {
    expression += escapePattern(claim.text.slice(cursor, match.index));
    expression += `(${numeric.source})`;
    cursor = match.index + match[0].length;
  }
  expression += `${escapePattern(claim.text.slice(cursor))}$`;
  const captured = new RegExp(expression).exec(rendered);
  if (!captured) problems.push("rendered가 원문·자리표시자 구조와 다름");
  for (const [index, match] of slots.entries()) {
    const binding = bindings.get(match[1]);
    const quantity =
      card &&
      [card.dailyMean, card.peakConcurrent].find(
        (value) => value.id === binding?.quantityId,
      );
    const value = binding && quantity ? quantity[binding.field] : null;
    const tail = claim.text.slice(match.index + match[0].length);
    const unit = tail
      .replace(/^\s*[~～–-]\s*\{\{[^{}]+\}\}/, "")
      .trimStart()
      .match(/^(명\/일|명|%|원|배|비율|일)(?![/%a-z])/u)?.[1];
    const cited =
      quantity &&
      evidence.some(
        (item) =>
          claim.evidenceIds.includes(item.id) &&
          item.quantityIds.includes(quantity.id),
      );
    if (
      !quantity ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !cited ||
      unit !== quantity.unit
    ) {
      problems.push(`${match[1]}: 카드 Quantity·근거 연결·단위 불일치`);
      continue;
    }
    const scale = ["명", "명/일"].includes(quantity.unit) ? 1 : 100;
    const expected =
      (Math.sign(value) *
        Math.round(Math.abs(value) * scale + Number.EPSILON)) /
      scale;
    const actual = Number(captured?.[index + 1]?.replaceAll(",", ""));
    if (actual !== expected)
      problems.push(
        `${match[1]}: 표시 ${actual}, 카드 ${binding?.field} 반올림 ${expected}`,
      );
    if (/[\d.,+−-]$/.test(claim.text.slice(0, match.index)))
      problems.push(`${match[1]}: 숫자 접두어 삽입`);
  }
  return { problems, numericTokens: tokens.length };
}
