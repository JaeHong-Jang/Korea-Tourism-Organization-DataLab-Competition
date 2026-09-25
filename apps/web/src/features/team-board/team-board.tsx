// 계약 상태와 게이트 결과로 예보팀 13명 및 작업 기록 서랍을 그린다.
import type {
  AgentStatus,
  AgentStep,
  GateReport,
} from "@crowdcast/contracts/types";
import { useCallback, useEffect, useRef, useState } from "react";
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
const names: Record<AgentId, string> = {
  lead: "지휘",
  dictation: "받아쓰기",
  "local-guide": "동네지기",
  archivist: "기록관",
  forecaster: "예보관",
  "source-check": "출처확인",
  "number-check": "숫자대조",
  "rule-check": "법규담당",
  skeptic: "깐깐이",
  explainer: "해설가",
  "card-maker": "카드장인",
  "plan-writer": "계획서",
  briefer: "브리핑",
};
const gateNames = {
  A: "분석 검증",
  B: "문장 검증",
  publish: "발행",
  integrity: "무결성 검사",
} as const;

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
  stepCounts,
  gates,
  sessionId,
}: {
  statuses: AgentStatus[];
  stepCounts: Record<string, number>;
  gates: GateReport[];
  sessionId: string | null;
}) {
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const drawer = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // 작업 기록을 닫으면 연 팀원 버튼으로 돌아가 다음 팀원을 고를 수 있게 한다.
  const close = useCallback(() => {
    setSelected(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  // 기록이 열리면 닫기 버튼으로 초점을 옮기고 Tab을 서랍 안에 머물게 한다.
  useEffect(() => {
    if (!selected) return;
    drawer.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab" && drawer.current) {
        const buttons = Array.from(
          drawer.current.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const first = buttons[0];
        const last = buttons.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, close]);
  const state = selected ? agentState(statuses, selected) : null;
  const refreshState = state === "done" || state === "error" ? state : null;
  // 같은 배치에서 여러 작업이 끝나도 누적 단계 수로 기록 변경을 감지한다.
  const requestKey = `${selected ?? ""}:${reload}:${refreshState ?? ""}:${selected ? (stepCounts[selected] ?? 0) : 0}`;
  useEffect(() => {
    if (!selected || !sessionId || !requestKey) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSteps([]);
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
  }, [selected, sessionId, requestKey]);
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
                    onClick={(event) => {
                      trigger.current = event.currentTarget;
                      setSelected(id);
                      if (selected === id) setReload((current) => current + 1);
                    }}
                    aria-label={`${names[id]} 작업 기록 열기`}
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
              {gate.passed ? "통과" : "위반"} · {gateNames[gate.gate]}
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
          ref={drawer}
          className="team-steps"
          role="dialog"
          aria-modal="true"
          aria-label="팀원 작업 기록"
        >
          <div className="team-steps__head">
            <strong>{names[selected]} 작업 기록</strong>
            <button type="button" onClick={close}>
              닫기
            </button>
          </div>
          {loading ? (
            <p>기록을 불러오는 중이에요.</p>
          ) : error ? (
            <div>
              <p role="alert">
                기록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.
              </p>
              <button
                type="button"
                onClick={() => setReload((current) => current + 1)}
              >
                다시 불러오기
              </button>
            </div>
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
