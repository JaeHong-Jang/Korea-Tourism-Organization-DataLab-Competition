// 결정적 예측 서비스의 결과를 행사·기준일과 대조한 뒤 그대로 적재한다
import type { Event, Forecast } from "@crowdcast/contracts/types";
import type { Agent } from "../runtime/agent.js";
import { asOfDate } from "./as-of.js";

// 수치·판정·근거는 서비스 응답을 보정하지 않고 게이트 A로 넘긴다
export const forecaster: Agent<
  Event,
  { forecast: Forecast; revision: number }
> = {
  id: "forecaster",
  team: "analysis",
  usesLlm: false,
  budgetMs: 8_000,
  // 적재가 성공해야 예보관 작업을 완료로 기록한다
  async run(ctx) {
    const forecast = await ctx.forecast.predict(ctx.input);
    if (
      forecast.eventId !== ctx.input.id ||
      forecast.asOf !== asOfDate(ctx.input.startsAt) ||
      forecast.predictionRun.asOf !== forecast.asOf
    )
      throw new Error("예보 행사 또는 D-14 기준일 불일치");
    const { revision } = await ctx.knowledge.addFacts(ctx.sessionId, {
      schema: "forecast",
      items: [forecast],
    });
    return {
      value: { forecast, revision },
      evidenceIds: forecast.evidence.map((item) => item.id),
      note: "예측 결과와 근거를 적재했어요.",
    };
  },
};
