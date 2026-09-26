// 검증된 문장 중 세 줄 요약과 점검할 다음 할 일을 선택한다
import type { Claim, ForecastReport } from "@crowdcast/contracts/types";
import type { Agent } from "../runtime/agent.js";
import { checkedClaims } from "./card-maker.js";

// 새 문구를 생성하지 않고 기존 문장 id와 렌더 결과만 고른다
export const briefer: Agent<Claim[], ForecastReport["brief"]> = {
  id: "briefer",
  team: "report",
  usesLlm: false,
  budgetMs: 1_000,
  // 검증된 본문을 요약·점검 목록으로 선택한다
  async run({ input }) {
    const claims = checkedClaims(input);
    const summary = ["판정", "수치", "설명", "요인", "권고"]
      .flatMap((kind) => claims.filter((claim) => claim.claimType === kind))
      .slice(0, 3);
    const [first, second, third] = summary.map((claim) => claim.id);
    const claimIds: ForecastReport["brief"]["claimIds"] = third
      ? [first, second, third]
      : second
        ? [first, second]
        : first
          ? [first]
          : [];
    return {
      value: {
        claimIds,
        actions: claims
          .filter((claim) => claim.claimType === "권고")
          .map((claim) => ({
            id: `check-${claim.id}`,
            label: claim.rendered ?? claim.text,
          })),
      },
      note: "검증된 문장에서 요약과 다음 할 일을 골랐어요.",
    };
  },
};
