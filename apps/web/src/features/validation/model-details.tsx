// 사용 모델의 버전·학습 범위·원문 한계를 읽기 쉽게 보여 준다.
import type { ModelCard } from "@crowdcast/contracts/types";
import { formatModelVersion } from "../../lib/validation/format-model-version";
import type { ContractState } from "../../lib/validation/use-contract";
import { ContractMessage } from "./contract-state";

// notes의 문자와 문단 경계를 그대로 보존한다.
export function ModelDetails({
  state,
  goldenEmpty,
}: {
  state: ContractState<ModelCard>;
  goldenEmpty: boolean;
}) {
  if (!state.value)
    return <ContractMessage state={state} empty="모델 카드가 아직 없어요." />;
  const card = state.value;
  return (
    <div className="validation-content">
      {goldenEmpty && (
        <strong className="validation-warning">
          골든 사례 0건 — 사례 재현 검증 전 임시 사용
        </strong>
      )}
      <dl className="validation-model-list">
        <div>
          <dt>버전</dt>
          <dd>{formatModelVersion(card.modelVersion)}</dd>
        </div>
        <div>
          <dt>학습 범위</dt>
          <dd>
            {card.trainRange.from} ~ {card.trainRange.to}
          </dd>
        </div>
        <div>
          <dt>평가 연도</dt>
          <dd>
            {card.evalYears.length ? card.evalYears.join(", ") : "기록 없음"}
          </dd>
        </div>
        <div>
          <dt>백테스트</dt>
          <dd>{card.backtestRunId ?? "기록 없음"}</dd>
        </div>
      </dl>
      <details>
        <summary>사용 피처 {card.features.length}개 보기</summary>
        <ul>
          {card.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </details>
      <h3>한계</h3>
      <div className="validation-notes">{card.notes}</div>
    </div>
  );
}
