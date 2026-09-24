// 스트림을 열기 전에 발생한 재생 오류를 HTTP 코드와 안전한 한 줄 설명으로 전달한다

// 파일 본문과 파일 시스템 경로를 오류 응답에 포함하지 않는다
export class ReplayError extends Error {
  // 라우트가 상태와 코드만 매핑하도록 재생 오류 정보를 묶는다
  constructor(
    readonly code: "BAD_TRACE_ID" | "TRACE_NOT_FOUND" | "TRACE_INVALID",
    readonly status: 400 | 404 | 422,
    message: string,
  ) {
    super(message);
  }
}
