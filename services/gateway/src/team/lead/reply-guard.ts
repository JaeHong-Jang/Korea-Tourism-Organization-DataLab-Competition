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

// 새 행사 이름: 아는 이름을 지운 뒤에도 이런 꼬리의 낱말이 남으면 지어낸 이름이다.
// 다만 "이번 축제는·마음에 드는 축제를"처럼 맨 낱말(축제·페스티벌 + 조사)은 일반 명사로 허용한다.
const festivalSuffix =
  /(?:축제|문화제|페스티벌|페스타|박람회|엑스포|한마당|대잔치)/u;
const genericFestival =
  /^(?:축제|문화제|페스티벌|페스타|박람회|엑스포|한마당|대잔치)(?:는|은|가|이|를|을|에|에서|의|도|로|와|과|예요|이에요|입니다|이에요)?[.!?,…]*$/u;
// 앞 낱말이 조사·어미로 끝나면(순으로·드는·원하시는) 일반 명사로 쓴 것이고, 명사(인터내셔널·빛섬)면 지어낸 이름의 일부다.
const pointerWord =
  /^(?:이번|이|그|해당|올해|이런|같은)$|(?:는|은|을|를|이|가|에|의|로|도|와|과|고|서|한|할|운|된|던|든|면|며|요|다|죠|께|만|까지|부터)$/u;
// 시도 이름 뒤에 장소 조사가 오면 사실 목록에 있어야 한다(예: "서울에서").
const sidoWord =
  /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?=에서|에|의|로|으로|까지|부터)/gu;
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
  let rest = text;
  for (const name of facts.names) if (name) rest = rest.split(name).join(" ");
  const words = rest.split(/\s+/).filter(Boolean);
  for (const [index, word] of words.entries())
    if (
      festivalSuffix.test(word) &&
      !(
        genericFestival.test(word) &&
        (index === 0 || pointerWord.test(words[index - 1]))
      )
    )
      return null;
  for (const match of text.matchAll(sidoWord))
    if (!known.includes(match[0])) return null;
  for (const match of text.matchAll(regionWord))
    if (!commonWord.test(match[0]) && !known.includes(match[0])) return null;
  return text;
}
