// 장소를 확정해 행사를 먼저 적재하고 공개 시점 이전 지역 평시 근거를 모은다
import type {
  Event,
  EventDraft,
  RegionBaseline,
} from "@crowdcast/contracts/types";
import type { Agent } from "../runtime/agent.js";
import { asOfDate } from "./as-of.js";
import { confirmedEvent } from "./confirmed-event.js";

type Input = {
  draft: EventDraft;
  today: string;
  ready(event: Event | null): void;
  showDraft(draft: EventDraft): Promise<void>;
};
type Output =
  | { baseline: RegionBaseline; revision: number }
  | {
      ask: {
        field: string;
        question: string;
        options: { label: string; value: string }[];
      };
    };

// 지오코딩·행사 적재가 끝나면 기록관을 깨워 평시 조회와 병렬로 진행한다
export const localGuide: Agent<Input, Output> = {
  id: "local-guide",
  team: "analysis",
  usesLlm: false,
  budgetMs: 8_000,
  // 장소 후보가 확정되기 전에는 행사나 평시 근거를 적재하지 않는다
  async run(ctx) {
    const { draft } = ctx.input;
    const { candidates } = await ctx.forecast.geocode(draft.venueText ?? "");
    const matches = draft.sigunguCode
      ? candidates.filter((item) => item.sigunguCode === draft.sigunguCode)
      : candidates;
    if (matches.length !== 1) {
      ctx.input.ready(null);
      const distinctRegions =
        candidates.length > 1 &&
        new Set(candidates.map((item) => item.sigunguCode)).size ===
          candidates.length;
      return {
        value: {
          ask: {
            field: distinctRegions ? "sigunguCode" : "venueText",
            question: "행사장의 정확한 주소와 시군구를 확인해 주세요.",
            options: distinctRegions
              ? candidates.map((item) => ({
                  label: item.sigunguName,
                  value: item.sigunguCode,
                }))
              : [],
          },
        },
        status: "blocked",
        note: "장소 후보를 확인해 주세요.",
      };
    }

    // 좌표와 지역을 확인한 행사만 그래프에 쓰고 다른 분석팀에 전달한다
    const place = matches[0];
    const event = confirmedEvent(ctx.sessionId, draft, place);
    await ctx.input.showDraft({
      ...draft,
      sigunguCode: place.sigunguCode,
      sigunguName: place.sigunguName,
    });
    await ctx.knowledge.addFacts(ctx.sessionId, {
      schema: "event",
      items: [event],
    });
    ctx.signal.throwIfAborted();
    ctx.input.ready(event);
    const baseline = await ctx.forecast.baseline(
      place.sigunguCode,
      asOfDate(event.startsAt, ctx.input.today),
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
