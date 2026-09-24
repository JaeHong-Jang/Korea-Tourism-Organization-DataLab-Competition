// 응답 본문까지 요청 마감과 상위 취소를 적용한다
export class RequestTimeoutError extends Error {
  // 런타임이 장애와 예산 초과를 구분할 수 있게 전용 오류를 쓴다
  constructor(timeoutMs: number) {
    super(`서비스 요청 시간 제한 초과 (${timeoutMs}ms)`);
    this.name = "RequestTimeoutError";
  }
}

// 취소를 무시하는 전송도 예산 안에 반환하고 뒤늦은 요청의 신호를 끊는다
export async function withRequestDeadline<T>(
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  parent?.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort(parent?.reason);
      reject(parent?.reason);
    };
    parent?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      const error = new RequestTimeoutError(timeoutMs);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  // 취소를 무시하는 전송도 마감에 반환하고 성공·실패 모두 타이머를 정리한다
  try {
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", cancel);
  }
}
