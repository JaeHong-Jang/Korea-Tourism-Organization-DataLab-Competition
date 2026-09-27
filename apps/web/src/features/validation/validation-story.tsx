// 검증 화면의 첫 문장과 세 칸, 이어서 읽는 접힌 설명을 만든다.
import type { BacktestSummary } from "@crowdcast/contracts/types";
import type { ReactNode } from "react";
import type { ContractState } from "../../lib/validation/use-contract";
import { ContractMessage } from "./contract-state";

const percent = (value: number) => value.toFixed(1);

// 승격된 백테스트의 공개 분모로 첫 화면 문장을 만든다.
export function validationLead(summary: BacktestSummary) {
  const evaluated = summary.disclosure?.evaluated ?? summary.metrics.coverageN;
  const covered =
    summary.disclosure?.covered ??
    Math.round(summary.metrics.coverage80 * evaluated);
  const gold = summary.disclosure?.byTier.gold;
  const silver = summary.disclosure?.byTier.silver;
  const years = summary.evalYears.join(", ");
  return `지금 예보에 쓰는 모델을, 학습에 넣지 않은 ${years}년 ${evaluated}건으로 채점했습니다. 일평균 방문객은 가운데 ${percent(summary.metrics.mdape)}% 빗나갔고, 10–90% 구간은 ${evaluated}건 중 ${covered}건만 참값을 담았습니다. 이 점수는 순간 최대도, 1,000명 경계도 채점하지 못했습니다. 행사장 정답은 ${gold ?? "—"}건이고 나머지 ${silver ?? "—"}건은 시군구 방문자에서 평시를 뺀 값입니다.`;
}

// 성적의 뜻을 세 칸으로만 보여 주고 내부 비교 쌍은 접힌 기록에 남긴다.
export function ValidationStory({
  state,
  children,
}: {
  state: ContractState<BacktestSummary>;
  children?: ReactNode;
}) {
  if (!state.value)
    return (
      <ContractMessage
        state={state}
        empty="백테스트 결과가 아직 공개되지 않았어요."
      />
    );
  const summary = state.value;
  const evaluated = summary.disclosure?.evaluated ?? summary.metrics.coverageN;
  const covered =
    summary.disclosure?.covered ??
    Math.round(summary.metrics.coverage80 * evaluated);
  const gold = summary.disclosure?.byTier.gold ?? 0;
  const silver = summary.disclosure?.byTier.silver ?? 0;
  return (
    <section className="validation-story" aria-label="검증 요약">
      <p>{validationLead(summary)}</p>
      <div className="validation-metrics">
        <div>
          <span>가운데 오차</span>
          <strong>{percent(summary.metrics.mdape)}%</strong>
          <small>일평균 방문객 · {evaluated}건의 절대 비율 오차 중앙값</small>
        </div>
        <div>
          <span>구간이 참값을 담은 비율</span>
          <strong>{percent(summary.metrics.coverage80 * 100)}%</strong>
          <small>
            {covered}/{evaluated} · 예측 10–90% 구간
          </small>
        </div>
        <div>
          <span>채점에 쓴 정답</span>
          <strong>
            {gold} + {silver}
          </strong>
          <small>
            행사장 {gold}건 · 시군구 순증 {silver}건
          </small>
        </div>
      </div>
      {children}
    </section>
  );
}
