// 불변 예보 스냅샷을 조회하고 상담 세션 없이 같은 계획 초안을 저장한다
import { createRecordsClient } from "../clients/records-client.js";
import { ServiceHttpError } from "../clients/request-json.js";
import type { GatewayConfig } from "../config.js";
import { responseSchema } from "../contract/responses.js";
import { Deadline } from "../team/lead/deadline.js";
import { savePublishedPlan } from "../team/lead/followup-plan.js";
import { teamSettings } from "../team/runtime/settings.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyJson,
  proxyOptions,
} from "./proxy-response.js";

const reportSchema = responseSchema("forecast-report");

// 아직 없는 스냅샷 API와 발행 전 예보는 프록시 장애 규칙에 따라 503을 반환한다
export function createForecastsRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  route.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!id.startsWith("f-")) throw new ProxyInputError();
    const client = createRecordsClient(
      proxyOptions(config, "records", fetcher, c.req.raw.signal),
    );
    return proxyJson(reportSchema, await client.getSnapshot(id));
  });

  // 본문이나 상담 상태 대신 records 스냅샷만으로 초안과 다운로드 경로를 반환한다
  route.post("/:id/plan", async (c) => {
    const id = c.req.param("id");
    if (!/^f-[a-z0-9][a-z0-9_.:-]{1,120}$/.test(id))
      throw new ProxyInputError();
    const signal = c.req.raw.signal;
    signal.throwIfAborted();
    const deadline = new Deadline(5_000);
    const disconnect = () => deadline.abort(signal.reason);
    signal.addEventListener("abort", disconnect, { once: true });
    try {
      const client = createRecordsClient(
        proxyOptions(config, "records", fetcher, deadline.controller.signal),
      );
      const report = await client.getSnapshot(id).catch((error: unknown) => {
        if (error instanceof ServiceHttpError && error.status === 404)
          return null;
        throw error;
      });
      if (!report) return c.json({ error: "not_found" }, 404);
      if (report.forecastId !== id)
        throw new Error("예보 스냅샷 응답 계약 위반: forecastId");
      const plan = await savePublishedPlan({
        report,
        deadline,
        settings: teamSettings(config, fetcher),
      });
      return c.json({
        plan,
        docxHref: `/api/plans/${plan.id}/export.docx`,
      });
    } catch (error) {
      if (error instanceof ServiceHttpError && error.status === 422)
        return c.json({ error: "plan_rejected" }, 502);
      throw error;
    } finally {
      signal.removeEventListener("abort", disconnect);
      deadline.dispose();
    }
  });
  return route;
}
