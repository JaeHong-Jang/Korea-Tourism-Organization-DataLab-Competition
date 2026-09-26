// 허용된 records 요청을 검증해 보내고 JSON 또는 docx를 마감 안에 읽는다
import type { ValidateFunction } from "ajv";
import { readRecordsJson, stageRecordsDocx } from "./records-response-body.js";
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
          redirect: "manual",
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

      // JSON·문서 모두 계약 미디어 타입을 확인한 뒤에만 본문을 읽는다
      const contentType = response.headers.get("content-type");
      if (
        !contentType ||
        contentType.split(";")[0].trim().toLowerCase() !==
          (request.docx ? DOCX_CONTENT_TYPE : "application/json")
      ) {
        await response.body?.cancel();
        throw new Error("records 응답 계약 위반: Content-Type");
      }

      // 바이너리는 상한 검사를 마친 임시 파일에서 다운로드 헤더와 함께 전달한다
      if (request.docx) {
        const stream = await stageRecordsDocx(response, signal, options.signal);
        const headers = new Headers({ "content-type": contentType });
        const disposition = response.headers.get("content-disposition");
        if (disposition) headers.set("content-disposition", disposition);
        return new Response(stream, { headers });
      }

      // JSON은 records.yaml의 해당 경로 응답 검사기를 통과해야 반환한다
      const body = await readRecordsJson(response, signal);
      if (!request.responseSchema?.(body))
        throw new Error("records 응답 계약 위반");
      return Response.json(body);
    },
    options.signal,
  );
}
