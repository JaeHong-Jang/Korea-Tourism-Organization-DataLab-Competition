// 계약에 집계된 평가 결과와 제공되지 않은 항목을 구분해 보여 준다.

import { EmptyState } from "../../components/common/empty-state";
import { ErrorState } from "../../components/common/error-state";
import { LoadingState } from "../../components/common/loading-state";
import { SourceTip } from "../../components/common/source-tip";
import type { OpsEvaluation } from "../../lib/ops-api";
import { dateTime } from "./ops-format";
import type { OpsResource } from "./use-ops-resource";
import "./ops-details.css";

const checkLabels = [
  ["sequence", "순서 규칙"],
  ["evidence", "근거 연결"],
  ["numbers", "숫자 일치"],
  ["interval", "구간 표시"],
  ["ask", "되묻기"],
  ["intent", "후속 의도"],
  ["publication", "발행"],
  ["execution", "실행"],
] as const;

// 표본이 없는 지연은 수치로 보이지 않게 하고 측정값만 초로 표시한다.
function latency(value: number | null): string {
  return value === null ? "측정 전" : `${value.toFixed(1)}초`;
}

// 평가 파일이 없거나 상태 요청이 실패하면 평가 카드만 상태를 바꾼다.
export function EvaluationCard({
  state,
}: {
  state: OpsResource<OpsEvaluation>;
}) {
  if (state.phase === "loading")
    return <LoadingState message="평가 결과를 불러오는 중이에요." />;
  if (state.phase === "error")
    return (
      <ErrorState message="평가 결과를 확인할 수 없어요. 잠시 뒤 다시 시도해 주세요." />
    );
  const evals = state.value.evals;
  if (!evals) return <EmptyState message="아직 발행된 평가 결과가 없어요." />;
  return (
    <div className="ops-evaluation">
      <p
        className={`ops-verdict ${evals.passed ? "ops-verdict--passed" : "ops-verdict--failed"}`}
      >
        {evals.passed ? "✓ 통과" : "⚠ 확인 필요"} · {evals.suite}
      </p>
      {evals.mode === "fake" && (
        <>
          <span className="ops-detail-badge ops-detail-badge--caution">
            가짜 서비스 실행
          </span>
          <p>가짜 서비스 결과의 숫자는 서식4에 사용하지 마세요.</p>
        </>
      )}
      <dl className="ops-facts">
        <div>
          <dt>평가 사례 합계</dt>
          <dd>
            {evals.cases.toLocaleString("ko-KR")}건{" "}
            <SourceTip evaluation={evals} />
          </dd>
        </div>
        <div>
          <dt>근거 없는 발행</dt>
          <dd>
            {evals.unsupportedPublished.toLocaleString("ko-KR")}건 ·{" "}
            {evals.unsupportedPublished === 0 ? "통과" : "실패"}
            <SourceTip evaluation={evals} />
          </dd>
        </div>
        <div>
          <dt>숫자 불일치</dt>
          <dd>
            {evals.numberMismatch.toLocaleString("ko-KR")}건 ·{" "}
            {evals.numberMismatch === 0 ? "통과" : "실패"}
            <SourceTip evaluation={evals} />
          </dd>
        </div>
      </dl>
      {evals.checks && checkLabels.some(([key]) => evals.checks?.[key]) ? (
        <div className="ops-checks-scroll">
          <table className="ops-checks">
            <caption>항목별 통과 / 전체</caption>
            <thead>
              <tr>
                <th scope="col">검사 항목</th>
                <th scope="col">통과 / 전체</th>
              </tr>
            </thead>
            <tbody>
              {checkLabels.map(([key, label]) => {
                const check = evals.checks?.[key];
                return check ? (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td>
                      {check.passed.toLocaleString("ko-KR")} /{" "}
                      {check.total.toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ) : null;
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>항목별 통과 결과는 아직 집계되지 않았어요.</p>
      )}
      {evals.latencySeconds ? (
        <dl className="ops-facts">
          <div>
            <dt>예보 카드 지연</dt>
            <dd>
              p50 {latency(evals.latencySeconds.forecast.p50)} · p95{" "}
              {latency(evals.latencySeconds.forecast.p95)}
            </dd>
          </div>
          <div>
            <dt>발행 완료 지연</dt>
            <dd>
              p50 {latency(evals.latencySeconds.publishedDone.p50)} · p95{" "}
              {latency(evals.latencySeconds.publishedDone.p95)}
            </dd>
          </div>
        </dl>
      ) : (
        <p>지연 p50·p95는 아직 집계되지 않았어요.</p>
      )}
      <p>
        결과 파일 시각:{" "}
        <time dateTime={evals.runAt}>{dateTime(evals.runAt)}</time>
      </p>
      <p>참고용 — 평가 시나리오는 개발팀이 만든 것</p>
      <p>출처: 운영 평가 집계</p>
    </div>
  );
}
