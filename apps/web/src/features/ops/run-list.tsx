// 파이프라인 실행 기록을 최신순 카드(결과·단계 사슬·한 문장 설명·수치 비교)와 단계별 상세로 보여 준다.
import type { PipelineRun } from "@crowdcast/contracts/types";
import { AlertTriangle, CheckCircle2, Clock3, Copy } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../components/common/empty-state";
import { ErrorState } from "../../components/common/error-state";
import { LoadingState } from "../../components/common/loading-state";
import { dateTime, duration, stageName, stageStatus } from "./ops-format";
import { type GateMetrics, outcomeTone, runOutcome } from "./run-outcome";
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

// 새 후보와 허용선을 나란히 두고 통과 여부를 기호와 글자로 함께 적는다.
export function MetricCompare({ metrics }: { metrics: GateMetrics }) {
  const rows = [
    {
      name: "오차율(MdAPE)",
      value: metrics.mdape,
      limit: `${metrics.mdapeLimit}% 이하`,
      ok: metrics.mdape <= metrics.mdapeLimit,
    },
    {
      name: "80% 구간 포함률",
      value: metrics.coverage,
      limit: `${metrics.coverageLimit}% 이상`,
      ok: metrics.coverage >= metrics.coverageLimit,
    },
  ];
  return (
    <ul className="ops-metrics" aria-label="새 후보 수치와 허용선">
      {rows.map((row) => (
        <li
          key={row.name}
          className={row.ok ? "ops-metric--ok" : "ops-metric--bad"}
        >
          {row.name} <strong>{row.value}%</strong>
          <span>
            {" "}
            · 기준 {row.limit} {row.ok ? "✓ 통과" : "✗ 미달"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// 시작 시각과 걸린 시간을 한 줄로(날짜는 월·일만) 줄인다.
function when(run: PipelineRun): string {
  const start = dateTime(run.startedAt);
  if (!run.finishedAt) return `${start} · 실행 중`;
  const took = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  return `${start} · ${Number.isFinite(took) ? duration(took) : "시간 확인 불가"}`;
}

const VISIBLE = 5;

// 빈 기록·상류 오류·계약 오류를 목록과 분리해 복구 방법을 안내하고, 최근 다섯 건만 먼저 보인다.
export function RunList({ state }: { state: OpsResource<PipelineRun[]> }) {
  const [all, setAll] = useState(false);
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
  const shown = all ? runs : runs.slice(0, VISIBLE);
  return (
    <section className="ops-run-list" aria-label="최근 파이프라인 실행 목록">
      <ol className="ops-runs">
        {shown.map((run) => {
          const outcome = runOutcome(run);
          const tone = outcomeTone[outcome.kind];
          return (
            <li
              key={run.runId}
              className={`ops-run ops-run--${run.status} ops-run--${tone}`}
            >
              <div className="ops-run__head">
                <span className={`ops-outcome ops-outcome--${tone}`}>
                  {tone === "danger" || tone === "caution" ? (
                    <AlertTriangle size={16} aria-hidden="true" />
                  ) : tone === "neutral" || run.status === "running" ? (
                    <Clock3 size={16} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  )}
                  {outcome.label}
                </span>
                <time dateTime={run.startedAt} title={run.startedAt}>
                  {when(run)}
                </time>
              </div>
              <StageChain run={run} />
              <p className="ops-run__reason">{outcome.sentence}</p>
              {outcome.metrics && <MetricCompare metrics={outcome.metrics} />}
              <details className="ops-run__details">
                <summary>단계 펼치기</summary>
                <p className="ops-run__id">
                  실행 ID <code>{run.runId}</code>
                  {run.finishedAt && <> · 끝 {dateTime(run.finishedAt)}</>}
                </p>
                <StageRows stages={run.stages} />
              </details>
            </li>
          );
        })}
      </ol>
      {runs.length > VISIBLE && (
        <button
          type="button"
          className="ops-run-list__more"
          aria-expanded={all}
          onClick={() => setAll((value) => !value)}
        >
          {all
            ? "최근 다섯 건만 보기"
            : `이전 기록 ${runs.length - VISIBLE}건 더 보기`}
        </button>
      )}
      <p className="ops-run-list__source">출처: 실행 기록</p>
    </section>
  );
}
