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
  signal?: AbortSignal;
};

// HTTP 메서드는 본문 유무와 독립적으로 정하고 오류 스키마는 호출별로 제한한다
type ServiceRequest = {
  method: "GET" | "POST";
  body?: unknown;
  bodySchema?: ValidateFunction;
  errorSchemas?: Partial<Record<number, ValidateFunction<unknown>>>;
  // 오류 본문이 없거나 JSON이 아닐 수도 있는 호출(예보 503)
  optionalErrorBody?: boolean;
};

// HTTP 상태와 검증된 오류 본문을 보존해 게이트 거부와 서비스 장애를 구분한다
export class ServiceHttpError extends Error {
  // 원문 응답은 오류 메시지에 섞지 않는다
  constructor(
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(`백엔드 HTTP 오류: ${status}`);
    this.name = "ServiceHttpError";
  }
}

// 읽은 JSON은 unknown으로 다루고 검증을 통과한 경우에만 생성 타입으로 반환한다
export async function requestJson<T>(
  options: ServiceClientOptions,
  path: string,
  validate: ValidateFunction<T>,
  request: ServiceRequest,
): Promise<T> {
  // 요청 타입 단언이나 잘못된 중첩 값이 네트워크 경계를 넘지 못하게 한다
  options.signal?.throwIfAborted();
  if (
    (request.bodySchema && !request.bodySchema(request.body)) ||
    (request.body !== undefined && !request.bodySchema)
  ) {
    throw new Error("서비스 요청 계약 위반");
  }
  return withRequestDeadline(
    options.timeoutMs ?? SERVICE_TIMEOUT_MS,
    async (signal) => {
      const response = await (options.fetch ?? fetch)(
        `${options.baseUrl.replace(/\/$/, "")}${path}`,
        {
          method: request.method,
          headers: {
            accept: "application/json",
            ...(request.body === undefined
              ? {}
              : { "content-type": "application/json" }),
          },
          body:
            request.body === undefined
              ? undefined
              : JSON.stringify(request.body),
          signal,
          redirect: "manual",
        },
      );
      if (request.method === "GET" ? response.status !== 200 : !response.ok) {
        const validateError = request.errorSchemas?.[response.status];
        if (!validateError) {
          await response.body?.cancel();
          throw new ServiceHttpError(response.status);
        }

        // 계약에 본문이 있는 오류만 읽고 검증을 통과해야 호출자에게 노출한다
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch (error) {
          // 본문이 선택인 오류(예보 503)만 JSON이 아니어도 상태 코드로 전달한다
          if (request.optionalErrorBody)
            throw new ServiceHttpError(response.status);
          throw error;
        }
        if (!validateError(errorBody)) {
          throw new Error(
            `서비스 오류 응답 계약 위반: ${contractRegistry.errorsText(validateError.errors)}`,
          );
        }
        throw new ServiceHttpError(response.status, errorBody);
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
    options.signal,
  );
}
