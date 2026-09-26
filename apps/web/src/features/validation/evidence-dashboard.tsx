// 발행 문장의 근거 연결과 데이터랩 도달을 각각 계산해 보여 준다.
import type { DatalabUsage } from "@crowdcast/contracts/types";
import { formatDate } from "../../lib/format";
import type { ContractState } from "../../lib/validation/use-contract";
import { ContractMessage } from "./contract-state";

// 분모가 없는 비율은 계산하지 않고 기록 부재를 명시한다.
export function EvidenceDashboard({
  state,
}: {
  state: ContractState<DatalabUsage>;
}) {
  if (!state.value)
    return <ContractMessage state={state} empty="근거 통계가 아직 없어요." />;
  const usage = state.value;
  const sorted = [...usage.evidenceByDataset].sort(
    (left, right) =>
      Number(right.datalabMenu != null) - Number(left.datalabMenu != null) ||
      right.count - left.count,
  );
  // 인용된 자료만 막대로 비교하고 아직 인용 0건인 자료는 이름만 따로 모은다.
  const cited = sorted.filter((item) => item.count > 0);
  const uncited = sorted.filter((item) => item.count === 0);
  const max = Math.max(1, ...cited.map((item) => item.count));
  return (
    <div className="validation-content">
      {usage.publishedClaims === 0 ? (
        <p className="validation-state">발행 문장이 아직 없어요.</p>
      ) : (
        <div className="validation-rates">
          <div>
            <span>근거 연결률</span>
            <strong>
              {(
                (100 * usage.claimsWithEvidence) /
                usage.publishedClaims
              ).toFixed(1)}
              %
            </strong>
            <small>
              {usage.claimsWithEvidence}/{usage.publishedClaims}문장
            </small>
          </div>
          <div>
            <span>데이터랩 도달률</span>
            <strong>
              {(
                (100 * usage.claimsReachingDatalab) /
                usage.publishedClaims
              ).toFixed(1)}
              %
            </strong>
            <small>
              {usage.claimsReachingDatalab}/{usage.publishedClaims}문장
            </small>
          </div>
        </div>
      )}
      <p>
        SHACL 통과율:{" "}
        {usage.shaclPassRate == null
          ? "검증 기록 없음"
          : `${(usage.shaclPassRate * 100).toFixed(1)}%`}
      </p>
      <h3>데이터셋별 근거 인용</h3>
      {cited.length ? (
        <ul className="validation-datasets">
          {cited.map((item) => (
            <li key={item.datasetId}>
              <span className="validation-dataset-label">
                <span>{item.title}</span>
                {item.datalabMenu && (
                  <small className="validation-datalab-menu">
                    {item.datalabMenu}
                  </small>
                )}
              </span>
              <div className="validation-dataset-track">
                <span style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
              <strong>{item.count}건</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>인용된 데이터셋이 아직 없어요.</p>
      )}
      {uncited.length > 0 && (
        <div className="validation-uncited">
          <h4>
            인용 0건 — 아직 예보 문장에 쓰이지 않은 자료 {uncited.length}개
          </h4>
          <ul>
            {uncited.map((item) => (
              <li key={item.datasetId}>{item.title}</li>
            ))}
          </ul>
        </div>
      )}
      <small>집계 {formatDate(usage.generatedAt)} (한국 시각)</small>
    </div>
  );
}
