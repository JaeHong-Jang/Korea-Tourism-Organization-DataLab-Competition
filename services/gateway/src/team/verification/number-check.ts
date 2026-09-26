// 자리표시자의 값·단위와 인용한 규칙 문구의 숫자만 렌더링에 허용한다
import type { Claim, Forecast } from "@crowdcast/contracts/types";
import type { CheckInput, CheckResult } from "../report/bundle.js";
import { formatQuantity } from "../report/quantity-format.js";
import type { Agent } from "../runtime/agent.js";

const PLACEHOLDER = /\{\{([a-z][a-z0-9_]*)\}\}/g;
const NUMBER = /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
const UNIT = /^(명\/일|명|%|원|배|비율|일)(?![/%a-z])/;

// 범위의 앞 값도 뒤에 적힌 단위를 공유하며 미등록 단위는 인정하지 않는다
function followingUnit(tail: string, placeholders = false) {
  const range = placeholders
    ? /^\s*[~～–-]\s*\{\{[a-z][a-z0-9_]*\}\}\s*/
    : /^\s*[~～–-]\s*[\d,.]+\s*/;
  return tail.replace(range, "").trimStart().match(UNIT)?.[1];
}

// 규칙 요약의 입력 JSON은 상수 문구가 아니므로 숫자 허용 목록에서 제외한다
function citedNumbers(claim: Claim, forecast: Forecast) {
  const allowed = new Set<string>();
  for (const item of forecast.evidence) {
    if (
      !claim.evidenceIds.includes(item.id) ||
      (item.kind !== "rule" && !item.clauseId)
    )
      continue;
    const text = `${item.title} ${item.summary.split(" 입력:")[0]}`;
    for (const match of text.matchAll(NUMBER)) {
      const unit = followingUnit(
        text.slice((match.index ?? 0) + match[0].length),
      );
      if (unit) allowed.add(`${match[0]}:${unit}`);
    }
  }
  return allowed;
}

// 모든 바인딩을 소비하고 미지정 숫자·단위·변조된 렌더 결과는 거부한다
export function checkNumbers(claim: Claim, forecast: Forecast): CheckResult {
  const quantities = [forecast.dailyMean, forecast.peakConcurrent];
  const bindings = new Map(claim.placeholders.map((item) => [item.name, item]));
  const used = new Set<string>();
  let passed = bindings.size === claim.placeholders.length;
  const rendered = claim.text.replace(
    PLACEHOLDER,
    (token: string, name: string, offset: number) => {
      const binding = bindings.get(name);
      const quantity = quantities.find(
        (item) => item.id === binding?.quantityId,
      );
      const value = quantity && binding ? quantity[binding.field] : null;
      const unit = followingUnit(claim.text.slice(offset + token.length), true);
      const cited =
        quantity &&
        forecast.evidence.some(
          (item) =>
            claim.evidenceIds.includes(item.id) &&
            item.quantityIds.includes(quantity.id),
        );
      if (
        !binding ||
        !quantity ||
        value == null ||
        !Number.isFinite(value) ||
        unit !== quantity.unit ||
        !cited ||
        /[\d.,+-]$/.test(claim.text.slice(0, offset))
      ) {
        passed = false;
        return token;
      }
      used.add(name);
      return formatQuantity(value, quantity.unit);
    },
  );

  // 자리표시자 이름의 숫자를 지운 뒤 규칙 인용 외의 리터럴을 전부 검사한다
  const literal = claim.text.replace(PLACEHOLDER, "");
  const allowed = citedNumbers(claim, forecast);
  for (const match of literal.matchAll(NUMBER)) {
    const unit = followingUnit(
      literal.slice((match.index ?? 0) + match[0].length),
    );
    if (!unit || !allowed.has(`${match[0]}:${unit}`)) passed = false;
  }
  if (
    /[{}]/.test(literal) ||
    /\p{N}/u.test(literal.replace(NUMBER, "")) ||
    used.size !== bindings.size
  )
    passed = false;
  if (claim.rendered !== null && claim.rendered !== rendered) passed = false;
  return { passed, rendered };
}

// 숫자 검사는 문장별 결과를 반환하고 새 예측 수치를 만들지 않는다
export const numberCheck: Agent<CheckInput, CheckResult[]> = {
  id: "number-check",
  team: "verification",
  usesLlm: false,
  budgetMs: 1_000,
  // 자리표시자마다 숫자·단위 검사를 남긴다
  async run({ input }) {
    return {
      value: input.claims.map((claim) => checkNumbers(claim, input.forecast)),
      note: "자리표시자의 값과 단위를 대조했어요.",
    };
  },
};
