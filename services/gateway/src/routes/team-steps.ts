// 세션별 완료·보류·실패 작업 기록을 계약 배열로 돌려준다
import type { AgentStep } from "@crowdcast/contracts/types";
import { Hono } from "hono";
import { contractRegistry } from "../contract/registry.js";
import type { SessionStore } from "../team/runtime/sessions.js";

const validate = contractRegistry.compile<AgentStep[]>({
  type: "array",
  items: { $ref: "https://crowdcast.local/schemas/agent-step.schema.json" },
});

// 없는 세션은 빈 기록과 구분하고 메모리 기록도 반환 직전에 검사한다
export function createTeamStepsRoute(store: SessionStore) {
  const route = new Hono();
  route.get("/:id/steps", (c) => {
    const session = store.get(c.req.param("id"));
    if (!session) return c.json({ message: "상담 세션이 없습니다." }, 404);
    if (!validate(session.steps)) throw new Error("작업 기록 계약 위반");
    return c.json(session.steps);
  });
  return route;
}
