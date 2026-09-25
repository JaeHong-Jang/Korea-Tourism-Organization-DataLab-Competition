// 팀장 답변의 숫자·새 행사 이름·새 지명·보장 표현만 거부하고 말투는 자유롭게 둔다
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

// 새 행사 이름: 이런 꼬리로 끝나는 말은 사실 목록에 있는 이름이어야 한다.
const festivalWord =
  /[가-힣A-Za-z]+(?:축제|문화제|페스티벌|페스타|박람회|엑스포|한마당|대잔치)/gu;
// 새 지명: 행정구역 꼬리 뒤에 장소 조사가 오면 사실 목록에 있는 지명이어야 한다(높임 '…시는'은 제외).
const regionWord =
  /[가-힣]+(?:특별자치시|특별자치도|특별시|광역시|시|군|구|도)(?=에서|에|의|로|으로|까지|부터)/gu;
// '구·도'로 끝나는 흔한 낱말은 지명 검사에서 뺀다.
const commonWord =
  /(?:친구|입구|출구|도구|연구|가구|요구|지구|정도|온도|속도|각도|제도|시도|인도|보도|태도|용도|의도|지도|도시|당시|동시|잠시|즉시|항시|평소도)$/u;

// 숫자·수 단어·보장 표현·새 행사 이름·새 지명만 막고 나머지 말투는 자유롭게 둔다(9/25 완화)
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
  if (sentences.length > 2) return null;
  const known = [
    ...facts.names,
    ...facts.grades,
    ...facts.conditions,
    ...facts.phrases,
    ...(facts.places ?? []),
    facts.origin ?? "",
    facts.template,
  ].join(" ");
  // 출발지는 사용자가 있는 곳이다 — 어느 행사의 지역도 아니면 "출발지에서 열리는·출발지의 행사"는 틀린 말이다.
  const origin = facts.origin;
  if (
    origin &&
    !(facts.places ?? []).some((place) => place.endsWith(`— ${origin}`)) &&
    new RegExp(`${origin}(?:에서\\s*(?:열리|하는|진행)|의\\s)`, "u").test(text)
  )
    return null;
  for (const match of text.matchAll(festivalWord))
    if (!known.includes(match[0])) return null;
  for (const match of text.matchAll(regionWord))
    if (!commonWord.test(match[0]) && !known.includes(match[0])) return null;
  return text;
}
