// 운영 화면 맨 위 "지금 상태" — 쓰는 모델·마지막 학습 결과·자료 최신성·발행 검증을 네 칸으로 요약한다.
import type {
  BacktestSummary,
  ModelCard,
  PipelineRun,
} from "@crowdcast/contracts/types";
import type { ReactNode } from "react";
import type { OpsEvaluation, OpsFreshness } from "../../lib/ops-api";
import { failingChecks, suiteName } from "./evaluation-card";
import { dateTime, lagDays } from "./ops-format";
import { MetricCompare } from "./run-list";
import { outcomeTone, runOutcome } from "./run-outcome";
import type { OpsResource } from "./use-ops-resource";

// 모델 카드 공개 문구의 "주 모델=…"을 사람이 읽는 이름과 한 줄 설명으로 바꾼다.
export function primaryModel(notes: string) {
  const name = notes.match(/주 모델=(\w+)/)?.[1] ?? null;
  if (name === "simple")
    return {
      name: "단순 모델",
      about:
        "같은 유형 축제의 과거 일평균 중앙값(전회차 실측이 있으면 그 규모)을 순간 최대로 환산해요.",
    };
  if (name === "lightgbm")
    return {
      name: "LightGBM",
      about: "행사 속성·지역 방문자 피처로 학습한 분위수 모델이에요.",
    };
  return { name: name ?? "확인 불가", about: "" };
}

// 한 칸의 제목·본문과 불러오기·오류 상태를 같은 모양으로 그린다.
function Tile<T>({
  title,
  state,
  tone,
  children,
}: {
  title: string;
  state: OpsResource<T>;
  tone?: string;
  children: (value: T) => ReactNode;
}) {
  return (
    <article className={`ops-tile${tone ? ` ops-tile--${tone}` : ""}`}>
      <h3>{title}</h3>
      {state.phase === "loading" && <p>불러오는 중이에요.</p>}
      {state.phase === "error" && <p>지금은 확인할 수 없어요.</p>}
      {state.phase === "ready" && children(state.value)}
    </article>
  );
}

// 학습·백테스트까지 실제로 돈 최근 실행(점검 실행 제외).
function lastTraining(runs: PipelineRun[]) {
  return [...runs]
    .filter((run) => !run.runId.startsWith("dry-"))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .find((run) =>
      run.stages.some((stage) => stage.name === "backtest" && stage.ms),
    );
}

export function OpsOverview({
  runs,
  freshness,
  evaluation,
  backtest,
  modelCard,
}: {
  runs: OpsResource<PipelineRun[]>;
  freshness: OpsResource<OpsFreshness>;
  evaluation: OpsResource<OpsEvaluation>;
  backtest: OpsResource<BacktestSummary>;
  modelCard: OpsResource<ModelCard>;
}) {
  const training = runs.phase === "ready" ? lastTraining(runs.value) : null;
  const outcome = training ? runOutcome(training) : null;
  return (
    <section className="ops-overview" aria-labelledby="ops-overview-title">
      <h2 id="ops-overview-title">지금 상태</h2>
      <div className="ops-tiles">
        <Tile title="지금 쓰는 모델" state={backtest}>
          {(summary) => {
            const model = primaryModel(
              modelCard.phase === "ready" ? modelCard.value.notes : "",
            );
            const card =
              freshness.phase === "ready" ? freshness.value.model : null;
            return (
              <>
                <p className="ops-tile__lead">
                  {model.name}
                  {card?.verdict && (
                    <span className="ops-detail-badge ops-detail-badge--caution">
                      {card.verdict}
                    </span>
                  )}
                </p>
                <p>
                  오차율 {summary.metrics.mdape.toFixed(1)}% · 80% 구간 포함률{" "}
                  {(summary.metrics.coverage80 * 100).toFixed(1)}% (평가{" "}
                  {summary.metrics.coverageN}건)
                </p>
                {model.about && <p className="ops-tile__note">{model.about}</p>}
                {card && (
                  <small>
                    버전 {card.modelVersion.slice(0, 11)}… ·{" "}
                    {dateTime(card.createdAt)} 적용
                  </small>
                )}
              </>
            );
          }}
        </Tile>
        <Tile
          title="마지막 학습 결과"
          state={runs}
          tone={outcome ? outcomeTone[outcome.kind] : undefined}
        >
          {() =>
            training && outcome ? (
              <>
                <p className="ops-tile__lead">{outcome.label}</p>
                <p>{outcome.sentence}</p>
                {outcome.metrics && <MetricCompare metrics={outcome.metrics} />}
                <small>{dateTime(training.startedAt)} 실행</small>
              </>
            ) : (
              <p>아직 학습까지 간 실행이 없어요.</p>
            )
          }
        </Tile>
        <Tile title="자료 최신성" state={freshness}>
          {({ freshness: sets, generatedAt }) => {
            const visitors = sets.find((set) =>
              set.datasetId.includes("visitors"),
            );
            const lag = visitors
              ? lagDays(visitors.lastObservedDate, generatedAt)
              : null;
            const collected = sets.filter((set) => set.lastCollectedAt).length;
            return (
              <>
                <p className="ops-tile__lead">
                  {visitors?.lastObservedDate
                    ? `방문자 ${visitors.lastObservedDate.slice(5).replace("-", "/")}까지`
                    : "방문자 자료 확인 불가"}
                </p>
                <p>
                  {lag === null
                    ? "반영 지연을 확인할 수 없어요."
                    : lag > 35
                      ? `${lag}일 늦어요 — 기준 35일을 넘었어요.`
                      : `${lag}일 늦게 공개되는 자료예요 — 기준 35일 안 ✓`}
                </p>
                <small>
                  자료 {sets.length}종 중 {collected}종 수집됨
                </small>
              </>
            );
          }}
        </Tile>
        <Tile
          title="발행 검증"
          state={evaluation}
          tone={
            evaluation.phase === "ready" && evaluation.value.evals
              ? evaluation.value.evals.passed
                ? "ok"
                : "caution"
              : undefined
          }
        >
          {({ evals }) =>
            evals ? (
              <>
                <p className="ops-tile__lead">
                  {evals.passed ? "문제 없음 ✓" : "확인 필요"}
                </p>
                <p>
                  {suiteName(evals.suite)} {evals.cases.toLocaleString("ko-KR")}
                  건 · 근거 없는 발행 {evals.unsupportedPublished}건 · 숫자
                  불일치 {evals.numberMismatch}건
                </p>
                {!evals.passed && failingChecks(evals.checks).length > 0 && (
                  <p>못 미친 항목: {failingChecks(evals.checks).join(" · ")}</p>
                )}
                <small>개발팀이 만든 평가 시나리오 기준</small>
              </>
            ) : (
              <p>아직 발행된 평가 결과가 없어요.</p>
            )
          }
        </Tile>
      </div>
      <p className="ops-overview__glossary">
        오차율(MdAPE)은 예보가 실제에서 벗어난 비율의 가운데 값이라 낮을수록
        좋고, 80% 구간 포함률은 "10번 중 8번은 이 안"으로 그린 범위에 실제가
        들어간 비율이라 80%에 가까울수록 좋아요.
      </p>
    </section>
  );
}
