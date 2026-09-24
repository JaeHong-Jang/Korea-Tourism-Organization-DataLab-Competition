// 계약 상태와 게이트 결과로 예보팀 13명 및 작업 기록 서랍을 그린다.
import type {
  AgentStatus,
  AgentStep,
  GateReport,
} from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { PetAvatar } from "../../components/pets";
import { getTeamSteps } from "../../lib/api-client";

const groups = [
  { label: "팀장", team: "lead", ids: ["lead"] },
  {
    label: "분석팀",
    team: "analysis",
    ids: ["dictation", "local-guide", "archivist", "forecaster"],
  },
  {
    label: "검증팀",
    team: "verification",
    ids: ["source-check", "number-check", "rule-check", "skeptic"],
  },
  {
    label: "보고팀",
    team: "report",
    ids: ["explainer", "card-maker", "plan-writer", "briefer"],
  },
] as const;
type AgentId = AgentStatus["agentId"];

// 아직 상태 이벤트가 없는 펫은 계약의 기본 대기 상태로 둔다.
export function agentState(
  statuses: AgentStatus[],
  id: AgentId,
): AgentStatus["state"] {
  return (
    [...statuses].reverse().find((status) => status.agentId === id)?.state ??
    "idle"
  );
}

// 팀원 버튼은 클릭과 키보드로 기록을 열고 실패도 서랍 안에 알린다.
export function TeamBoard({
  statuses,
  gates,
  sessionId,
}: {
  statuses: AgentStatus[];
  gates: GateReport[];
  sessionId: string | null;
}) {
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!selected || !sessionId) return;
    const controller = new AbortController();
    setLoading(true);
    getTeamSteps(sessionId, controller.signal)
      .then(setSteps)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "기록을 읽지 못했어요.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected, sessionId]);
  const failed = gates.filter((gate) => !gate.passed);
  return (
    <>
      <div className="team-groups">
        {groups.map((group) => (
          <div className="team-group" key={group.team}>
            <h3>{group.label}</h3>
            <div className="team-members">
              {group.ids.map((id) => {
                const status = [...statuses]
                  .reverse()
                  .find((item) => item.agentId === id);
                return (
                  <button
                    type="button"
                    className="team-member"
                    title={status?.note || undefined}
                    key={id}
                    onClick={() => {
                      setSelected(id);
                      setError("");
                    }}
                    aria-label={`${id} 작업 기록 열기`}
                  >
                    <PetAvatar
                      agentId={id}
                      state={agentState(statuses, id)}
                      size={32}
                      label={status?.note || undefined}
                    />
                    {failed.some(
                      (gate) =>
                        group.team ===
                        (gate.gate === "A"
                          ? "analysis"
                          : gate.gate === "B"
                            ? "verification"
                            : "report"),
                    ) && <span className="team-member__raised">손들기</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="team-gates">
        {gates.map((gate) => (
          <details
            key={`${gate.gate}-${gate.revision}-${gate.masterVersion}-${gate.passed}`}
          >
            <summary>
              {gate.passed ? "통과" : "위반"} · 게이트 {gate.gate}
            </summary>
            {gate.violations.length ? (
              <ul>
                {gate.violations.map((violation) => (
                  <li
                    key={`${violation.nodeId}-${violation.shapeId}-${violation.message}`}
                  >
                    {violation.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p>검사 항목을 통과했어요.</p>
            )}
          </details>
        ))}
      </div>
      {selected && (
        <div
          className="team-steps"
          role="dialog"
          aria-modal="false"
          aria-label="팀원 작업 기록"
        >
          <div className="team-steps__head">
            <strong>{selected} 작업 기록</strong>
            <button type="button" onClick={() => setSelected(null)}>
              닫기
            </button>
          </div>
          {loading ? (
            <p>기록을 불러오는 중이에요.</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : steps.filter((step) => step.agentId === selected).length ? (
            <ul>
              {steps
                .filter((step) => step.agentId === selected)
                .map((step) => (
                  <li key={step.stepId}>
                    <strong>{step.inputSummary}</strong>
                    <span className="team-step-detail">
                      근거 {step.outputEvidenceIds.join(", ") || "없음"} ·{" "}
                      {step.ms ?? "대기"}ms · LLM{" "}
                      {step.usedLlm ? `사용 (${step.model})` : "미사용"}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p>아직 기록이 없어요.</p>
          )}
        </div>
      )}
    </>
  );
}
