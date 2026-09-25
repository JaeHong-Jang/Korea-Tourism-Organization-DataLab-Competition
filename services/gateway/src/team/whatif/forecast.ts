// 조건 변경 API를 기존 예보관의 기준일·근거 적재 경로에 연결한다
import type { Event } from "@crowdcast/contracts/types";
import { requestJson } from "../../clients/request-json.js";
import { contractRegistry } from "../../contract/registry.js";
import { responseSchema } from "../../contract/responses.js";
import { forecaster } from "../analysis/forecaster.js";
import { fakeForecastFetch } from "../runtime/fake-forecast.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { WhatifChanges } from "./changes.js";

const requestSchema = contractRegistry.compile({
  type: "object",
  additionalProperties: false,
  required: ["event", "changes"],
  properties: {
    event: { $ref: "https://crowdcast.local/schemas/event.schema.json" },
    changes: {
      type: "object",
      minProperties: 1,
      additionalProperties: false,
      properties: Object.fromEntries(
        ["startsAt", "endsAt", "timeOfDay", "fee", "type", "hazards"].map(
          (field) => [
            field,
            {
              $ref: `https://crowdcast.local/schemas/event.schema.json#/properties/${field}`,
            },
          ],
        ),
      ),
    },
  },
});

// 요청의 취소·마감·응답 계약을 지키며 이전 예보 식별자의 재사용을 거부한다
export function whatifForecaster(
  event: Event,
  changes: WhatifChanges,
  previousIds: string[],
  settings: TeamSettings,
): typeof forecaster {
  return {
    ...forecaster,
    async run(ctx) {
      return forecaster.run({
        ...ctx,
        forecast: {
          ...ctx.forecast,
          async predict() {
            const forecast = await requestJson(
              {
                baseUrl: settings.config.services.forecast,
                fetch:
                  settings.mode === "fake"
                    ? fakeForecastFetch
                    : settings.fetcher,
                timeoutMs: forecaster.budgetMs,
                signal: ctx.signal,
              },
              "/v1/whatif",
              responseSchema("forecast"),
              {
                method: "POST",
                body: { event, changes },
                bodySchema: requestSchema,
              },
            );
            if (previousIds.includes(forecast.id))
              throw new Error("새 예보 식별자가 필요합니다");
            return forecast;
          },
        },
      });
    },
  };
}
