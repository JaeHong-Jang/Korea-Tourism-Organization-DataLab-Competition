// 저장된 행사의 개최지 평시 근거를 상담과 같은 기준일로 다시 모은다(장소는 이미 확정 — 지오코딩 없음)
import type { Event, RegionBaseline } from "@crowdcast/contracts/types";
import { asOfDate } from "../analysis/as-of.js";
import type { Agent } from "../runtime/agent.js";

type Input = { event: Event; today: string };
type Output = { baseline: RegionBaseline; revision: number };

// 동네지기와 같은 평시 조회·적재만 하고 결과를 예보관 앞 근거로 넘긴다
export const savedBaseline: Agent<Input, Output> = {
  id: "local-guide",
  team: "analysis",
  usesLlm: false,
  budgetMs: 8_000,
  async run(ctx) {
    const { event, today } = ctx.input;
    const baseline = await ctx.forecast.baseline(
      event.sigunguCode,
      asOfDate(event.startsAt, today),
    );
    if (baseline.sigunguCode !== event.sigunguCode)
      throw new Error("평시 지역이 행사 지역과 다릅니다");
    const { revision } = await ctx.knowledge.addFacts(ctx.sessionId, {
      schema: "region-baseline",
      items: [baseline],
    });
    return {
      value: { baseline, revision },
      evidenceIds: baseline.evidence.map((item) => item.id),
      note: "개최 지역의 평시 근거를 확인했어요.",
    };
  },
};
