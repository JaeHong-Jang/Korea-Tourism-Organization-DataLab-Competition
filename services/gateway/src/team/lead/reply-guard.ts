// 팀장 답변의 숫자·새 이름·보장 표현을 보수적으로 거부한다
import { contractRegistry } from "../../contract/registry.js";
import type { ReplyFacts } from "./reply-facts.js";

export const replySchema = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
    text: {
      type: "string",
      minLength: 1,
      maxLength: 400,
      pattern: "^[^0-9]*$",
    },
  },
};
const validateReply = contractRegistry.compile<{ text: string }>(replySchema);
const forbidden =
  /안전(?:해|하|한|합|을\s*보장)|보장|확실|확정|무조건|반드시|절대|위험(?:이|은)?\s*없|걱정\s*없|문제\s*없|예약|무료|할인/;
const numberWords =
  /(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|백|천|만)\s*(?:개|곳|명|원|시간|분|킬로|퍼센트|배|번째)/;

// 허용된 이름과 결과별 어휘만 받으므로 알려지지 않은 고유명사·새 사실은 통과하지 못한다
export function checkedReply(value: unknown, facts: ReplyFacts): string | null {
  if (!validateReply(value)) return null;
  const text = value.text.trim();
  if (
    !text ||
    /\p{N}/u.test(text) ||
    numberWords.test(text) ||
    forbidden.test(text)
  )
    return null;
  if (!/^[\p{L}\s.!?,·~…'"‘’“”()-]+$/u.test(text)) return null;
  const sentences = text
    .split(/[.!?\n]+/)
    .filter((sentence) => sentence.trim());
  if (
    sentences.length > 2 ||
    (text.match(/(?:어요|아요|해요|세요|니다|예요)(?=\s|[.!?]|$)/g)?.length ??
      0) > 2
  )
    return null;
  let remaining = text;
  for (const name of [...facts.names, ...facts.grades].sort(
    (a, b) => b.length - a.length,
  )) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    remaining = remaining.replace(
      new RegExp(
        `(?<![\\p{L}])${escaped}(?:에서|으로|이에요|예요|은|는|이|가|을|를|와|과|도)?(?=$|[^\\p{L}])`,
        "gu",
      ),
      " ",
    );
  }
  const vocabulary = new Set(
    [
      ...`${facts.template} ${facts.phrases.join(" ")} ${facts.conditions.join(" ")}`.matchAll(
        /[가-힣A-Za-z]+/g,
      ),
      ..."네 좋아요 함께 한번 먼저 편하게 천천히 살펴보세요 살펴볼까요 확인해 볼까요 드릴게요".matchAll(
        /[가-힣A-Za-z]+/g,
      ),
    ].map((match) => match[0]),
  );
  if (
    [...remaining.matchAll(/[\p{L}]+/gu)].some(
      (match) => !vocabulary.has(match[0]),
    )
  )
    return null;
  return text;
}
