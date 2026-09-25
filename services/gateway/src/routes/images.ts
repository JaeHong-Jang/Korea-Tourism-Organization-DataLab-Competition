// 행사 이미지 식별자를 검사하고 forecast의 캐시 응답을 중계한다
import { requestImage } from "../clients/image-client.js";
import type { GatewayConfig } from "../config.js";
import { contractRegistry } from "../contract/registry.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyOptions,
} from "./proxy-response.js";

const validateId = contractRegistry.compile<string>({
  $ref: "https://crowdcast.local/schemas/common.schema.json#/$defs/eventId",
});

// 조회 실패와 정상적인 이미지 부재를 구분한다
export function createImagesRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  route.get("/:eventId", async (c) => {
    const id = c.req.param("eventId");
    if (!validateId(id)) throw new ProxyInputError();
    return requestImage(
      proxyOptions(config, "forecast", fetcher, c.req.raw.signal),
      id,
    );
  });
  return route;
}
