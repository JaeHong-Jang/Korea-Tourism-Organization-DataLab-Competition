// 같은 행사의 동시 재예보를 차단하고 검증된 비교 결과를 반환한다
import type { GatewayConfig } from "../config.js";
import { responseSchema } from "../contract/responses.js";
import { Deadline } from "../team/lead/deadline.js";
import { ReforecastError } from "../team/reforecast/error.js";
import { runReforecast } from "../team/reforecast/run.js";
import { type TeamOptions, teamSettings } from "../team/runtime/settings.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyJson,
} from "./proxy-response.js";

const resultSchema = responseSchema("reforecast-result");

// 잠금은 첫 상류 호출 전에 잡고 성공·실패·취소 모두에서 해제한다
export function createEventsRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
  options: TeamOptions = {},
) {
  const route = createProxyRoute();
  const inProgress = new Set<string>();
  const settings = teamSettings(config, fetcher, options);
  route.post("/:id/reforecast", async (c) => {
    const id = c.req.param("id");
    if (!/^e-[a-z0-9][a-z0-9_.:-]{1,120}$/.test(id))
      throw new ProxyInputError();
    if (inProgress.has(id))
      return c.json(
        {
          code: "reforecast_in_progress",
          message: "이 행사의 재예보가 진행 중이에요.",
        },
        409,
      );
    const signal = c.req.raw.signal;
    signal.throwIfAborted();
    const deadline = new Deadline(settings.deadlineMs);
    const cancel = () => deadline.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    inProgress.add(id);
    try {
      return proxyJson(
        resultSchema,
        await runReforecast(id, settings, deadline, signal),
      );
    } catch (error) {
      if (error instanceof ReforecastError)
        return c.json(
          { code: error.code, message: error.message },
          error.status,
        );
      throw error;
    } finally {
      inProgress.delete(id);
      signal.removeEventListener("abort", cancel);
      deadline.dispose();
    }
  });
  return route;
}
