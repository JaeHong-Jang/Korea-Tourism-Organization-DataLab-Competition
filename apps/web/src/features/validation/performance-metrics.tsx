// 백테스트 성적과 평가 표본의 한계를 함께 보여 준다.
import type { BacktestSummary } from "@crowdcast/contracts/types";
import type { ContractState } from "../../lib/validation/use-contract";
import { ContractMessage } from "./contract-state";

const number = (value: number) => value.toLocaleString("ko-KR");

// 각 핵심 지표에서 같은 백테스트 실행을 바로 확인하게 한다.
function BacktestSource({ runId }: { runId: string }) {
  return (
    <details className="source-tip">
      <summary>ⓘ 출처</summary>
      <p>백테스트 {runId}</p>
    </details>
  );
}

// 계약의 포함률 비율만 백분율로 바꾸고 이미 %p인 값은 그대로 읽는다.
export function PerformanceMetrics({
  state,
}: {
  state: ContractState<BacktestSummary>;
}) {
  if (!state.value)
    return (
      <ContractMessage
        state={state}
        empty="백테스트 결과가 아직 공개되지 않았어요."
      />
    );
  const { metrics, disclosure, points, evalYears, runId } = state.value;
  const denominator = disclosure?.evaluated ?? metrics.coverageN;
  const covered =
    disclosure?.covered ?? Math.round(metrics.coverage80 * denominator);
  const boundary = disclosure?.belowThresholdActual === 0;
  const baseline = disclosure?.baselinePairs;
  return (
    <div className="validation-content">
      <div className="validation-metrics">
        <div>
          <span>MdAPE</span>
          <strong>{metrics.mdape.toFixed(1)}%</strong>
          <small>일평균 방문객 · 평가 {number(denominator)}건</small>
          <BacktestSource runId={runId} />
        </div>
        <div>
          <span>80% 구간 포함률</span>
          <strong>{(metrics.coverage80 * 100).toFixed(1)}%</strong>
          <small>
            ({number(covered)}/{number(denominator)})
          </small>
          <BacktestSource runId={runId} />
        </div>
        <div>
          <span>판정 재현율</span>
          <strong>
            {metrics.judgmentRecall == null
              ? "—"
              : `${(metrics.judgmentRecall * 100).toFixed(1)}%`}
          </strong>
          <small>
            {boundary
              ? "실측 대상 미만 0건 — 경계 성능은 아직 말할 수 없어요"
              : "환산 판정"}
          </small>
          <BacktestSource runId={runId} />
        </div>
        <div>
          <span>판정 정밀도</span>
          <strong>
            {metrics.judgmentPrecision == null
              ? "—"
              : `${(metrics.judgmentPrecision * 100).toFixed(1)}%`}
          </strong>
          <small>
            {boundary
              ? "실측 대상 미만 0건 — 경계 성능은 아직 말할 수 없어요"
              : "환산 판정"}
          </small>
          <BacktestSource runId={runId} />
        </div>
        <div>
          <span>기준선 대비</span>
          <strong>
            {metrics.comparablePairs === 0
              ? "—"
              : metrics.baselineDeltaPp == null
                ? "—"
                : `${metrics.baselineDeltaPp.toFixed(1)}%p`}
          </strong>
          <small>
            {metrics.comparablePairs === 0
              ? "비교 쌍 없음"
              : `비교 ${number(metrics.comparablePairs)}쌍`}
          </small>
          <BacktestSource runId={runId} />
        </div>
      </div>
      <p className="validation-source">
        백테스트 {runId} · 평가 연도 {evalYears.join(", ")} · 산점도{" "}
        {number(points.length)}건
      </p>
      {disclosure && (
        <div className="validation-disclosure">
          <p>
            평가 N {number(disclosure.evaluated)}건 (골드{" "}
            {number(disclosure.byTier.gold)} · 실버{" "}
            {number(disclosure.byTier.silver)}) · 명절 실버 등 채점 불가{" "}
            {number(disclosure.unscorable)}건
          </p>
          <p>
            비교 쌍 B0 {baseline?.b0 ? number(baseline.b0) : "—"} · B1{" "}
            {baseline?.b1 ? number(baseline.b1) : "—"} · B2{" "}
            {baseline?.b2 ? number(baseline.b2) : "—"}
            {baseline &&
              Object.entries(baseline).filter(([, value]) => value === 0)
                .length > 0 &&
              " (—: 비교 쌍 없음)"}
          </p>
          <p>
            건너뛴 연도:{" "}
            {disclosure.skippedYears.length
              ? disclosure.skippedYears
                  .map((item) => `${item.year}년 ${item.reason}`)
                  .join(" · ")
              : "없음"}
          </p>
        </div>
      )}
    </div>
  );
}
