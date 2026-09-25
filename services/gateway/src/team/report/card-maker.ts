// 검증된 문장을 종류별 예보서 칸과 근거 카드 순서에 배치한다
import type {
  Claim,
  Evidence,
  ForecastReport,
} from "@crowdcast/contracts/types";
import type { Agent } from "../runtime/agent.js";

// candidate 이외의 문장은 배치에 섞을 수 없다
export function checkedClaims(claims: Claim[]) {
  if (
    !claims.length ||
    claims.some(
      (claim) =>
        claim.status !== "candidate" ||
        !claim.checks.length ||
        claim.checks.some((check) => !check.passed),
    )
  )
    throw new Error("검증된 문장만 배치할 수 있습니다");
  return claims;
}

// 판정·수치·설명·점검 순서를 고정하고 각 문장의 근거를 같은 칸에 둔다
export const cardMaker: Agent<
  { claims: Claim[]; evidence: Evidence[] },
  ForecastReport["layout"]
> = {
  id: "card-maker",
  team: "report",
  usesLlm: false,
  budgetMs: 1_000,
  // 문장 유형과 근거 종류 순서로 배치를 고른다
  async run({ input }) {
    const slots = {
      판정: "judgment",
      수치: "numbers",
      요인: "explanation",
      설명: "explanation",
      권고: "checklist",
    } as const;
    const kinds = ["rule", "model", "assumption", "check", "data", "case"];
    const rank = (id: string) =>
      kinds.indexOf(input.evidence.find((item) => item.id === id)?.kind ?? "");
    const layout: ForecastReport["layout"][number][] = [];
    for (const slot of [
      "judgment",
      "numbers",
      "explanation",
      "checklist",
    ] as const) {
      const claims = checkedClaims(input.claims).filter(
        (claim) => slots[claim.claimType] === slot,
      );
      if (claims.length)
        layout.push({
          slot,
          claimIds: claims.map((claim) => claim.id),
          evidenceIds: [
            ...new Set(claims.flatMap((claim) => claim.evidenceIds)),
          ].sort((a, b) => rank(a) - rank(b)),
        });
    }
    const [first, ...rest] = layout;
    if (!first) throw new Error("문장 배치가 없습니다");
    return {
      value: [first, ...rest],
      note: "검증된 문장과 근거 카드를 배치했어요.",
    };
  },
};
