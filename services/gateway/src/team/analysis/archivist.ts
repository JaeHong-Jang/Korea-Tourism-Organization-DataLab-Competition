// 행사 계약으로 유사 사례를 조회하고 사례의 근거 묶음을 적재한다
import type { Event, SimilarEvent } from "@crowdcast/contracts/types";
import type { Agent } from "../runtime/agent.js";

// 빈 사례 목록은 적재하지 않고 기록으로 남겨 예보 서비스가 부족 여부를 판단하게 한다
export const archivist: Agent<Event, SimilarEvent[]> = {
  id: "archivist",
  team: "analysis",
  usesLlm: false,
  budgetMs: 6_000,
  // 사례와 그 안의 근거를 같은 facts 요청에 묶는다
  async run(ctx) {
    const similar = await ctx.forecast.similar(ctx.input);
    if (similar.length)
      await ctx.knowledge.addFacts(ctx.sessionId, {
        schema: "similar-event",
        items: similar,
      });
    return {
      value: similar,
      evidenceIds: similar.flatMap((item) =>
        item.evidence.map((evidence) => evidence.id),
      ),
      note: similar.length
        ? "유사 행사의 근거를 모았어요."
        : "비교할 유사 사례가 부족해요.",
    };
  },
};
