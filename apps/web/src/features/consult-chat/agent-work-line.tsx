// 실제 상태 이벤트만으로 현재 팀원과 지나간 작업을 대화에 보여 준다.
import type { GateReport } from "@crowdcast/contracts/types";
import { PetAvatar } from "../../components/pets";
import { agentNames } from "../team-board/team-board";
import type { StatusReply } from "./use-consult-session";

// 게이트 통과 여부는 같은 요청에 들어온 검사 이벤트에서만 확인한다.
export function AgentWorkLine({
  statuses,
  gates,
  busy,
  completed,
}: {
  statuses: StatusReply[];
  gates: GateReport[];
  busy: boolean;
  completed: boolean;
}) {
  if (!busy && !completed && !statuses.length) return null;
  const latest = statuses.at(-1)?.status;
  const published = gates.some(
    (gate) => gate.gate === "publish" && gate.passed,
  );
  const checked = new Set(
    statuses
      .filter(
        ({ status }) => status.state === "done" && status.agentId !== "lead",
      )
      .map(({ status }) => status.agentId),
  );
  const doneText = published
    ? checked.size >= 12
      ? "예보팀 12명이 확인했어요 · 게이트 통과"
      : "예보팀이 확인했어요 · 게이트 통과"
    : "예보팀의 작업을 확인했어요";
  return (
    <div className="consult-work" aria-live="polite">
      {busy ? (
        <div className="consult-work__current">
          {latest && (
            <PetAvatar
              agentId={latest.agentId}
              state={latest.state}
              size={32}
            />
          )}
          <span>
            {latest
              ? `${agentNames[latest.agentId]} · ${latest.note}`
              : "예보팀 응답을 기다리고 있어요"}
          </span>
          <span
            className="consult-work__dots"
            role="status"
            aria-label="응답 입력 중"
          >
            ···
          </span>
        </div>
      ) : (
        <details>
          <summary>{doneText}</summary>
          <ol>
            {statuses.map(({ status, seq }) => (
              <li key={seq}>
                <PetAvatar
                  agentId={status.agentId}
                  state={status.state}
                  size={32}
                />
                <span>
                  {agentNames[status.agentId]} · {status.note}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
