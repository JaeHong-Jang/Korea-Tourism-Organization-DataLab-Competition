// 네트워크 없는 받아쓰기 테스트에 고정된 녹화 응답을 돌려준다
// 2026-09-24 qwen3 로컬 평가의 첫 응답을 원문 그대로 보존한다
export const FAKE_EVENT_TEXT =
  "2026년 10월 3일 오후 6시부터 오후 9시까지 인천 중구 영종도에서 영종도 불꽃축제를 열어요. 행사 유형은 불꽃입니다. 입장료는 무료입니다. 주최는 인천 중구청입니다. 예산은 2억원입니다.";
export const FAKE_EXTRACTION = {
  budgetText: "2억원",
  dateText: "2026년 10월 3일 오후 6시부터 오후 9시까지",
  feeText: "무료",
  hazards: [],
  hostText: "인천 중구청",
  name: "영종도 불꽃축제",
  promo: [],
  timeText: "오후 6시부터 오후 9시까지",
  typeText: "불꽃",
  venueText: "인천 중구 영종도",
};
const recordings: Readonly<Record<string, string>> = {
  [FAKE_EVENT_TEXT]: JSON.stringify(FAKE_EXTRACTION),
};

// 모르는 입력은 그럴듯한 응답을 만들지 않고 실제 장애와 같은 폼 대체 경로로 보낸다
export function replayExtraction(
  text: string,
  supplied: Readonly<Record<string, string>> = recordings,
): string {
  if (!Object.hasOwn(supplied, text))
    throw new Error("가짜 LLM 녹화 응답 없음");
  return supplied[text];
}
