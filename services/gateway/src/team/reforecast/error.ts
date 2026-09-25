// 재예보의 행사 부재와 검증 거부를 상류 장애와 구분한다
export class ReforecastError extends Error {
  // 응답에 허용된 코드와 안내만 보관하고 상류 본문을 노출하지 않는다
  constructor(
    readonly status: 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
