// 같은 청크에서 팀원 작업 둘이 완료되어도 열린 기록 서랍을 다시 조회한다.
// @vitest-environment jsdom
import type { AgentStatus } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { getTeamSteps } from "../../lib/api-client";
import { TeamBoard } from "./team-board";

vi.mock("../../lib/api-client", () => ({
  getTeamSteps: vi.fn().mockResolvedValue([]),
}));

// 상태가 같은 채 작업 수만 0에서 2로 뛰는 배치를 기록 변경으로 취급한다.
it("한 청크의 두 agent_step 뒤 열린 팀원 기록을 다시 읽는다", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const statuses = [{ agentId: "dictation", state: "done" }] as AgentStatus[];
  const readSteps = vi.mocked(getTeamSteps);
  readSteps.mockClear();

  // 먼저 서랍을 연 상태에서 첫 작업 기록을 조회한다.
  await act(async () => {
    root.render(
      <TeamBoard
        statuses={statuses}
        stepCounts={{}}
        gates={[]}
        sessionId="s-test"
      />,
    );
  });
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(
        "[aria-label='받아쓰기 작업 기록 열기']",
      )
      ?.click();
  });
  expect(readSteps).toHaveBeenCalledTimes(1);

  // 최종 상태 문자열은 그대로 두고 같은 배치의 두 작업을 반영한다.
  await act(async () => {
    root.render(
      <TeamBoard
        statuses={statuses}
        stepCounts={{ dictation: 2 }}
        gates={[]}
        sessionId="s-test"
      />,
    );
  });
  expect(readSteps).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
  container.remove();
});
