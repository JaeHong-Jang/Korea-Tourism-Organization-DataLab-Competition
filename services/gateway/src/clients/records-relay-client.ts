// 허용된 records 요청을 검증해 보내고 JSON 또는 docx를 마감 안에 읽는다
import type { ValidateFunction } from "ajv";
import { withRequestDeadline } from "./request-deadline.js";
import { type ServiceClientOptions, ServiceHttpError } from "./request-json.js";

export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// 라우트가 선택한 계약과 경로만 전송 계층에 넘긴다
export type RecordsRelayRequest = {
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
  bodySchema?: ValidateFunction;
  responseSchema?: ValidateFunction;
  docx?: boolean;
};

// 본문 검증을 네트워크 직전에 반복해 호출자가 잘못된 값을 전송하지 못하게 한다
export function relayRecords(
  options: ServiceClientOptions,
  request: RecordsRelayRequest,
) {
  if (
    (request.bodySchema && !request.bodySchema(request.body)) ||
    (request.body !== undefined && !request.bodySchema)
  ) {
    throw new Error("records 요청 계약 위반");
  }
  return withRequestDeadline(
    options.timeoutMs ?? 5_000,
    async (signal) => {
      const response = await (options.fetch ?? fetch)(
        `${options.baseUrl.replace(/\/$/, "")}${request.path}`,
        {
          method: request.method,
          signal,
          redirect: "error",
          headers: {
            accept: request.docx ? DOCX_CONTENT_TYPE : "application/json",
            ...(request.bodySchema
              ? { "content-type": "application/json" }
              : {}),
          },
          body: request.bodySchema ? JSON.stringify(request.body) : undefined,
        },
      );
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new ServiceHttpError(response.status);
      }

      // 바이너리는 계약 MIME과 다운로드 이름을 유지하고 바이트를 바꾸지 않는다
      if (request.docx) {
        const contentType = response.headers.get("content-type");
        if (
          contentType?.split(";")[0].trim().toLowerCase() !== DOCX_CONTENT_TYPE
        ) {
          await response.body?.cancel();
          throw new Error("docx 응답 계약 위반");
        }
        const bytes = await response.arrayBuffer();
        const headers = new Headers({ "content-type": contentType });
        const disposition = response.headers.get("content-disposition");
        if (disposition) headers.set("content-disposition", disposition);
        return new Response(bytes, { headers });
      }

      // JSON은 records.yaml의 해당 경로 응답 검사기를 통과해야 반환한다
      const body: unknown = await response.json();
      if (!request.responseSchema?.(body))
        throw new Error("records 응답 계약 위반");
      return Response.json(body);
    },
    options.signal,
  );
}
