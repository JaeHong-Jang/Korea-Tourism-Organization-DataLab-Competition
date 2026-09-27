// 상담 단계에 맞는 입력창 이름과 안내 문구를 정한다.
export type InputContext =
  | "initial"
  | "forecast"
  | "recommendation"
  | "error"
  | "continuing";

// 처리 중 안내와 추가 질문을 우선하고 완료 뒤에는 후속 질문을 안내한다.
export function inputGuidance(
  busy: boolean,
  answering: boolean,
  context: InputContext,
) {
  if (busy)
    return {
      label: "답변 준비 중",
      placeholder: "답변을 준비하고 있어요. 완료되면 이어서 질문할 수 있어요.",
    };
  if (answering)
    return {
      label: "답을 입력해 주세요",
      placeholder: "위 질문에 답하거나 필요한 정보를 적어 주세요",
    };
  if (context === "error")
    return {
      label: "상담 질문 입력",
      placeholder: "요청을 다시 시도하거나 내용을 바꿔 입력해 주세요",
    };
  if (context === "forecast")
    return {
      label: "예보 후속 질문 또는 새 행사 입력",
      placeholder: "이 예보에 대해 질문하거나 다른 행사를 알려 주세요",
    };
  if (context === "recommendation")
    return {
      label: "축제 검색 조건 입력",
      placeholder: "원하는 지역·날짜를 바꾸거나 다른 축제를 찾아보세요",
    };
  if (context === "continuing")
    return {
      label: "상담 질문 입력",
      placeholder: "행사 정보를 더 알려 주시거나 궁금한 내용을 적어 주세요",
    };
  return {
    label: "행사를 설명해 주세요",
    placeholder: "행사 날짜, 장소, 종류를 적어 주세요",
  };
}
