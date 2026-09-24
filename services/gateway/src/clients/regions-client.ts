// 경계 JSON을 검증하고 캐시·출처 헤더를 함께 읽는다
import { regionsSchema } from "./query-schemas.js";
import { withRequestDeadline } from "./request-deadline.js";
import { type ServiceClientOptions, ServiceHttpError } from "./request-json.js";

// 헤더 수신 이후 JSON 읽기까지 동일한 마감을 적용한다
export function readRegions(options: ServiceClientOptions) {
  return withRequestDeadline(
    options.timeoutMs ?? 5_000,
    async (signal) => {
      const response = await (options.fetch ?? fetch)(
        `${options.baseUrl.replace(/\/$/, "")}/v1/regions/topojson`,
        {
          headers: { accept: "application/json" },
          signal,
          redirect: "manual",
        },
      );
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new ServiceHttpError(response.status);
      }

      // 출처·캐시 헤더만 전달하고 쿠키 등 무관한 헤더를 내보내지 않는다
      const body: unknown = await response.json();
      if (!regionsSchema(body)) throw new Error("경계 응답 계약 위반");
      const headers = new Headers();
      for (const [name, value] of response.headers) {
        if (
          ["cache-control", "source", "attribution", "link"].includes(name) ||
          /^x-(?:data-)?(?:source|attribution|license)(?:-|$)/.test(name)
        )
          headers.set(name, value);
      }
      return { body, headers };
    },
    options.signal,
  );
}
