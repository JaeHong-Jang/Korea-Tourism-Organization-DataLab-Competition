// 계약에 집계된 평가 결과와 제공되지 않은 항목을 구분해 보여 준다.

import { EmptyState } from "../../components/common/empty-state";
import { ErrorState } from "../../components/common/error-state";
import { LoadingState } from "../../components/common/loading-state";
import { SourceTip } from "../../components/common/source-tip";
import type { OpsEvaluation } from "../../lib/ops-api";
import { dateTime } from "./ops-format";
import type { OpsResource } from "./use-ops-resource";

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
        <div>
          <dt>추출·시나리오별 통과 / 전체</dt>
          <dd>아직 집계되지 않았어요</dd>
        </div>
        <div>
          <dt>지연 p50·p95</dt>
          <dd>아직 집계되지 않았어요</dd>
        </div>
      </dl>
      <p>
        결과 파일 시각:{" "}
        <time dateTime={evals.runAt}>{dateTime(evals.runAt)}</time>
      </p>
      <p>참고용 — 평가 시나리오는 개발팀이 만든 것</p>
      <p>출처: 운영 평가 집계</p>
    </div>
  );
}
