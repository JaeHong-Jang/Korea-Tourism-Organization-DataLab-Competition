// 응답 본문까지 포함한 요청 전체에 마감을 적용하고 지연된 fetch를 취소한다
export async function withRequestDeadline<T>(
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`서비스 요청 시간 제한 초과 (${timeoutMs}ms)`);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  // 취소를 무시하는 전송도 마감에 반환하고 성공·실패 모두 타이머를 정리한다
  try {
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
