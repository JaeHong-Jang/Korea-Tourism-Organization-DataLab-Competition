// 캐시된 행사 이미지의 바이트·Content-Type과 부재 상태를 그대로 가져온다
import { SERVICE_TIMEOUT_MS } from "../config.js";
import { withRequestDeadline } from "./request-deadline.js";
import { type ServiceClientOptions, ServiceHttpError } from "./request-json.js";

// 본문까지 같은 취소·시간 제한으로 읽어 지연된 이미지 연결을 남기지 않는다
export async function requestImage(
  options: ServiceClientOptions,
  eventId: string,
) {
  return withRequestDeadline(
    options.timeoutMs ?? SERVICE_TIMEOUT_MS,
    async (signal) => {
      const response = await (options.fetch ?? fetch)(
        `${options.baseUrl.replace(/\/$/, "")}/v1/images/${encodeURIComponent(eventId)}`,
        { method: "GET", redirect: "manual", signal },
      );
      if (![200, 404].includes(response.status)) {
        await response.body?.cancel();
        throw new ServiceHttpError(response.status);
      }
      const headers = new Headers();
      const contentType = response.headers.get("content-type");
      if (contentType) headers.set("content-type", contentType);
      return new Response(await response.arrayBuffer(), {
        status: response.status,
        headers,
      });
    },
    options.signal,
  );
}
