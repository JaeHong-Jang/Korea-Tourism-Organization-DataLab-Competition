// 13명 펫의 상태를 계약 agent_status 이벤트만으로 정하는지 확인한다.
import type { AgentStatus } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { PET_AGENT_IDS } from "../../components/pets/pet-avatar";
import { agentState } from "./team-board";

it("13명 각각의 마지막 상태를 사용하고 이벤트가 없으면 대기한다", () => {
  expect(PET_AGENT_IDS).toHaveLength(13);
  const statuses = PET_AGENT_IDS.map((agentId, index) => ({
    agentId,
    state: index % 2 ? "working" : "done",
  })) as AgentStatus[];
  for (const [index, id] of PET_AGENT_IDS.entries())
    expect(agentState(statuses, id)).toBe(index % 2 ? "working" : "done");
  expect(agentState([], "lead")).toBe("idle");
  expect(
    agentState(
      [...statuses, { ...statuses[0], state: "blocked" }],
      PET_AGENT_IDS[0],
    ),
  ).toBe("blocked");
});
