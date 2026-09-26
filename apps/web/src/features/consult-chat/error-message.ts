// 상담 스트림 오류를 사용자 말로 바꾸되 무슨 검사에서 멈췄는지는 남긴다.

// 스트림 검사 오류는 종류를 밝히고, 예보팀이 보낸 이유(게이트 실패 등)는 그대로 보여 준다
export function consultErrorMessage(error: string): string {
  if (error.startsWith("SSE 순서 위반"))
    return "예보팀 응답 순서가 맞지 않아 멈췄어요(순서 검사). 같은 내용을 다시 보내 주세요.";
  if (error.startsWith("SSE 계약 위반"))
    return "예보팀 응답 형식을 확인하지 못해 멈췄어요(형식 검사). 같은 내용을 다시 보내 주세요.";
  if (/^(TypeError|Failed to fetch|NetworkError|HTTP \d)/.test(error))
    return "상담을 이어가지 못했어요. 같은 내용을 다시 보내 주세요.";
  return error;
}
