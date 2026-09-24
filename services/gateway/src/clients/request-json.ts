// 백엔드 JSON 요청에 시간 제한·HTTP 오류 처리·응답 계약 검증을 함께 적용한다
import type { ValidateFunction } from "ajv";
import { SERVICE_TIMEOUT_MS } from "../config.js";
import { contractRegistry } from "../contract/registry.js";
import { withRequestDeadline } from "./request-deadline.js";

// 가짜 fetch와 짧은 시간 예산을 주입해 서비스 없이도 클라이언트를 검증한다
export type ServiceClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

// HTTP 상태를 보존해 호출자가 충돌과 서비스 장애를 구분할 수 있게 한다
export class ServiceHttpError extends Error {
  // 원문 응답은 오류 메시지에 섞지 않는다
  constructor(readonly status: number) {
    super(`백엔드 HTTP 오류: ${status}`);
    this.name = "ServiceHttpError";
  }
}

// 읽은 JSON은 unknown으로 다루고 검증을 통과한 경우에만 생성 타입으로 반환한다
export async function requestJson<T>(
  options: ServiceClientOptions,
  path: string,
  validate: ValidateFunction<T>,
  body?: unknown,
): Promise<T> {
  return withRequestDeadline(
    options.timeoutMs ?? SERVICE_TIMEOUT_MS,
    async (signal) => {
      const response = await (options.fetch ?? fetch)(
        `${options.baseUrl.replace(/\/$/, "")}${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            accept: "application/json",
            ...(body === undefined
              ? {}
              : { "content-type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new ServiceHttpError(response.status);
      }

      // 날짜·단위·추정 표시·중첩 근거가 잘못된 응답은 보정 없이 거부한다
      const data: unknown = await response.json();
      if (!validate(data)) {
        throw new Error(
          `서비스 응답 계약 위반: ${contractRegistry.errorsText(validate.errors)}`,
        );
      }
      return data;
    },
  );
}
