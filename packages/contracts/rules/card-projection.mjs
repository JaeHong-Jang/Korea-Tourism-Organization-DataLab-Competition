// 숫자 카드(forecast-card) = 예보(forecast)의 결정적 투영 — 게이트 A 뒤 SSE와 예보서 스냅샷이 같은 함수를 쓴다

// 판정 사유에서 카드에 보일 칸(규칙·종류·문구)만 남긴다(근거 id·조항은 발행 뒤에만)
const cardReason = ({ ruleId, kind, text }) => ({ ruleId, kind, text });

// 예보에서 숫자 카드를 만든다(값을 새로 계산하지 않고 그대로 옮긴다)
export function projectCard(f) {
  return {
    id: f.id,
    eventId: f.eventId,
    asOf: f.asOf,
    modelVersion: f.modelVersion,
    dailyMean: f.dailyMean,
    peakConcurrent: f.peakConcurrent,
    probabilities: f.probabilities,
    peakHours: f.peakHours,
    judgment: { level: f.judgment.level, label: f.judgment.label, reasons: f.judgment.reasons.map(cardReason) },
    ood: f.ood,
    oodReasons: f.oodReasons,
  };
}

// 키 순서와 상관없이 두 값을 비교하도록 정렬한 JSON 문자열을 만든다
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

// 카드가 투영과 다른 최상위 칸 이름을 돌려준다(같으면 빈 배열)
export function cardDiff(card, forecast) {
  const want = projectCard(forecast);
  const keys = new Set([...Object.keys(card ?? {}), ...Object.keys(want)]);
  return [...keys].filter((k) => canonical(card?.[k]) !== canonical(want[k]));
}
