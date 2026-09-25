// 파이프라인 실행 기록을 최신순 표와 단계별 상세로 보여 준다.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex: 표의 가로 스크롤 영역에 키보드 초점을 준다.
import type { PipelineRun } from "@crowdcast/contracts/types";
import { AlertTriangle, CheckCircle2, Clock3, Copy } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../components/common/empty-state";
import { ErrorState } from "../../components/common/error-state";
import { LoadingState } from "../../components/common/loading-state";
import {
  dateTime,
  duration,
  runStatus,
  stageName,
  stageStatus,
} from "./ops-format";
import type { OpsResource } from "./use-ops-resource";

// 실행 단계의 상태를 아이콘·글자·토큰 색으로 함께 표시한다.
function StageRows({ stages }: { stages: PipelineRun["stages"] }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <ol className="ops-stages">
      {stages.map((stage) => (
        <li key={stage.name} className={`ops-stage ops-stage--${stage.status}`}>
          <div className="ops-stage__heading">
            {stage.status === "failed" ? (
              <AlertTriangle aria-hidden="true" size={17} />
            ) : stage.status === "passed" ? (
              <CheckCircle2 aria-hidden="true" size={17} />
            ) : (
              <Clock3 aria-hidden="true" size={17} />
            )}
            <strong>{stageName[stage.name]}</strong>
            <span>{stageStatus[stage.status]}</span>
            <span>소요 {duration(stage.ms)}</span>
          </div>
          <p>
            게이트:{" "}
            {stage.gate.passed === null
              ? "미확인"
              : stage.gate.passed
                ? "통과"
                : "실패"}
            {stage.gate.message ? ` · ${tidyMessage(stage.gate.message)}` : ""}
          </p>
          {stage.artifacts.length > 0 && (
            <ul className="ops-artifacts">
              {stage.artifacts.map((artifact) => (
                <li key={`${artifact.path}:${artifact.sha256}`}>
                  <span title={artifact.path}>{artifact.path}</span>
                  <code title={artifact.sha256}>
                    {artifact.sha256.slice(0, 12)}
                  </code>
                  <button
                    type="button"
                    aria-label={`${artifact.path} 해시 복사`}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(artifact.sha256);
                        setCopied(artifact.sha256);
                      } catch {
                        setCopied(null);
                      }
                    }}
                  >
                    <Copy size={14} aria-hidden="true" /> 복사
                  </button>
                  {copied === artifact.sha256 && (
                    <span role="status">복사했어요</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

// 게이트 문구의 긴 소수(49.10331408…)는 화면에서만 한 자리로 줄인다.
export function tidyMessage(message: string): string {
  return message.replace(/(\d+\.\d)\d{2,}/g, "$1");
}

// 어느 단계에서 왜 멈췄는지 한 줄로 만든다 — 실패 단계가 먼저, 없으면 돌았지만 검증 못 한 단계.
export function stoppedAt(run: PipelineRun): string | null {
  const failed = run.stages.find((stage) => stage.status === "failed");
  if (failed)
    return `${stageName[failed.name]}에서 멈췄어요 — ${tidyMessage(failed.gate.message ?? "이유 기록 없음")}`;
  const unverified = run.stages.find(
    (stage) =>
      stage.status === "skipped" &&
      stage.ms !== null &&
      stage.gate.passed === null,
  );
  if (unverified)
    return `${stageName[unverified.name]}는 돌았지만 검증하지 못했어요 — ${tidyMessage(unverified.gate.message ?? "이유 기록 없음")}`;
  return null;
}

// 단계 순서대로 상태를 작은 칩으로 늘어놓아 한눈에 어디까지 갔는지 보이게 한다.
function StageChain({ run }: { run: PipelineRun }) {
  return (
    <ol className="ops-chain" aria-label="단계별 상태">
      {run.stages.map((stage) => {
        const unverified =
          stage.status === "skipped" &&
          stage.ms !== null &&
          stage.gate.passed === null;
        const label = unverified ? "검증 못 함" : stageStatus[stage.status];
        return (
          <li
            key={stage.name}
            className={`ops-chain__step ops-chain__step--${unverified ? "unverified" : stage.status}`}
            title={`${stageName[stage.name]} · ${label}`}
          >
            {stageName[stage.name]}
            <span className="sr-only"> {label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// 빈 기록·상류 오류·계약 오류를 표와 분리해 복구 방법을 안내한다.
export function RunList({ state }: { state: OpsResource<PipelineRun[]> }) {
  if (state.phase === "loading")
    return <LoadingState message="실행 기록을 불러오는 중이에요." />;
  if (state.phase === "error")
    return (
      <ErrorState message="실행 기록을 확인할 수 없어요. 잠시 뒤 다시 시도해 주세요." />
    );
  if (state.value.length === 0)
    return (
      <EmptyState
        message="아직 실행 기록이 없어요. 새로고침해 확인해 주세요."
        action={
          <button type="button" onClick={() => window.location.reload()}>
            새로고침
          </button>
        }
      />
    );
  const runs = [...state.value].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
  return (
    <section
      className="ops-table-scroll"
      aria-label="실행 기록 표, 좌우로 스크롤"
      tabIndex={0}
    >
      <table className="ops-runs">
        <caption className="sr-only">최근 파이프라인 실행 목록</caption>
        <thead>
          <tr>
            <th scope="col">시작</th>
            <th scope="col">끝</th>
            <th scope="col">상태</th>
            <th scope="col">요약</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.runId} className={`ops-run ops-run--${run.status}`}>
              <td>
                <time dateTime={run.startedAt} title={run.startedAt}>
                  {dateTime(run.startedAt)}
                </time>
                <small>{run.runId}</small>
              </td>
              <td>
                {run.finishedAt ? (
                  <time dateTime={run.finishedAt} title={run.finishedAt}>
                    {dateTime(run.finishedAt)}
                  </time>
                ) : (
                  "진행 중"
                )}
              </td>
              <td>
                <span className={`ops-status ops-status--${run.status}`}>
                  {run.status === "failed" ? (
                    <AlertTriangle size={16} aria-hidden="true" />
                  ) : run.status === "passed" ? (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  ) : (
                    <Clock3 size={16} aria-hidden="true" />
                  )}
                  {runStatus[run.status]}
                </span>
              </td>
              <td>
                <StageChain run={run} />
                <p className="ops-run__reason">
                  {stoppedAt(run) ??
                    (run.status === "passed"
                      ? "모든 단계를 통과했어요."
                      : (run.summary ?? "요약 작성 전"))}
                </p>
                <details className="ops-run__details">
                  <summary>단계 펼치기</summary>
                  <StageRows stages={run.stages} />
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>출처: 실행 기록</p>
    </section>
  );
}
