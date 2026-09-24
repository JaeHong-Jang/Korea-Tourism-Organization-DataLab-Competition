// 행사 목록의 기간 쿼리와 시도·유형·단계 필터를 처리한다
import { createForecastQueries } from "../clients/forecast-queries.js";
import { festivalsSchema } from "../clients/query-schemas.js";
import type { GatewayConfig } from "../config.js";
import { contractRegistry } from "../contract/registry.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyJson,
  proxyOptions,
  queryNumber,
} from "./proxy-response.js";

// gateway.yaml의 선택 쿼리 형식을 데이터 보정 없이 검증한다
const filtersSchema = contractRegistry.compile<{
  from?: string;
  to?: string;
  sido?: string;
  type?: string;
  level?: number;
}>({
  type: "object",
  properties: {
    from: { type: "string", format: "date" },
    to: { type: "string", format: "date" },
    sido: { type: "string" },
    type: {
      $ref: "https://crowdcast.local/schemas/common.schema.json#/$defs/eventType",
    },
    level: { type: "integer", minimum: 1, maximum: 4 },
  },
});

// 공식 행정구역 접미사를 제외해 표시 이름의 시도 부분을 비교한다
function provinceName(name: string) {
  return name
    .trim()
    .split(/\s+/)[0]
    .replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
}

// 원본 목록 전체를 검증한 뒤 필터를 적용해 잘못된 항목이 가려지지 않게 한다
export function createFestivalsRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  const client = createForecastQueries(
    proxyOptions(config, "forecast", fetcher),
  );
  route.get("/", async (c) => {
    const filters = {
      from: c.req.query("from"),
      to: c.req.query("to"),
      sido: c.req.query("sido"),
      type: c.req.query("type"),
      level: queryNumber(c.req.query("level")),
    };
    if (!filtersSchema(filters)) throw new ProxyInputError();
    const festivals = await client.festivals(filters.from, filters.to);
    const filtered = festivals.filter(
      (festival) =>
        (filters.sido === undefined ||
          (/^\d{2}$/.test(filters.sido)
            ? festival.sigunguCode.startsWith(filters.sido)
            : provinceName(festival.sigunguName) ===
              provinceName(filters.sido))) &&
        (filters.type === undefined || festival.type === filters.type) &&
        (filters.level === undefined || festival.level === filters.level),
    );
    return proxyJson(festivalsSchema, filtered);
  });
  return route;
}
