// 원문의 위험 관련 표현은 확인 후보로만 쓰고 실제 위험요소는 사용자에게 묻는다
import type { EventDraft } from "@crowdcast/contracts/types";

// T-102 행사 정규화와 같은 표현을 계약 위험요소에 대응한다
export const HAZARD_KEYWORDS = {
  폭죽: ["불꽃", "폭죽"],
  불: ["달집", "낙화", "들불", "횃불"],
  수면: ["수상", "물놀이", "카누", "래프팅"],
  산: ["등산", "산행"],
} as const;

// 불꽃 유형과 명시 표현은 질문 후보일 뿐 hazards 배열을 자동으로 채우지 않는다
export function hazardCandidates(
  text: string,
  type: EventDraft["type"],
): EventDraft["hazards"] {
  return (
    Object.keys(HAZARD_KEYWORDS) as (keyof typeof HAZARD_KEYWORDS)[]
  ).filter(
    (hazard) =>
      (hazard === "폭죽" && type === "불꽃") ||
      HAZARD_KEYWORDS[hazard].some((word) => text.includes(word)),
  );
}

// 복수 선택과 해당 없음의 빈 배열 답변을 한 질문으로 안내한다
export function hazardQuestion(candidates: EventDraft["hazards"]) {
  return {
    field: "hazards",
    question:
      "위험요소를 확인해 주세요. 여러 항목을 선택할 수 있고, 없으면 ‘해당 없어요’를 골라 주세요.",
    options: [
      ...candidates.map((value) => ({
        label: `${value} ${["폭죽", "불"].includes(value) ? "써요" : "활동을 해요"}`,
        value,
      })),
      { label: "해당 없어요", value: "[]" },
    ],
  };
}
