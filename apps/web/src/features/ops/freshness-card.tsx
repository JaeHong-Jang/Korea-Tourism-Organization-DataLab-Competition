// 자료별 수집·반영 지연과 모델·근거 그래프 상태를 표시한다.
import { AlertTriangle } from "lucide-react";
import { ErrorState } from "../../components/common/error-state";
import type { OpsFreshness } from "../../lib/ops-api";
import { dateTime, lagDays } from "./ops-format";
import type { OpsResource } from "./use-ops-resource";

// 자료 기준일이 35일을 넘으면 텍스트와 아이콘으로 지연을 알린다.
export function FreshnessCard({ state }: { state: OpsResource<OpsFreshness> }) {
  if (state.phase === "loading")
    return <p role="status">최신성을 불러오는 중이에요.</p>;
  if (state.phase === "error")
    return (
      <ErrorState message={`최신성을 확인할 수 없어요. ${state.message}`} />
    );
  const { freshness, model, graph, generatedAt } = state.value;
  return (
    <div className="ops-freshness">
      <h3>자료 수집</h3>
      {freshness.length === 0 ? (
        <p>등록된 자료가 없어요.</p>
      ) : (
        <ul>
          {freshness.map((dataset) => {
            const lag = lagDays(dataset.lastObservedDate, generatedAt);
            return (
              <li
                key={dataset.datasetId}
                className={lag !== null && lag > 35 ? "ops-dataset--late" : ""}
              >
                <strong>{dataset.title}</strong>
                <span>
                  마지막 수집:{" "}
                  {dataset.lastCollectedAt
                    ? dateTime(dataset.lastCollectedAt)
                    : "미수집"}
                </span>
                <span>자료 기준일: {dataset.lastObservedDate ?? "미확인"}</span>
                <span>
                  {lag === null ? (
                    "반영 지연: 확인 불가"
                  ) : (
                    <>
                      반영 지연: {lag}일{" "}
                      {lag > 35 && (
                        <>
                          <AlertTriangle size={15} aria-hidden="true" /> 35일
                          초과 경고
                        </>
                      )}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <h3>사용 모델</h3>
      <dl className="ops-facts">
        <div>
          <dt>버전</dt>
          <dd>
            {model.modelVersion} · {model.modelRunId}
          </dd>
        </div>
        <div>
          <dt>학습 범위</dt>
          <dd>
            {model.trainRange.from} ~ {model.trainRange.to}
          </dd>
        </div>
        <div>
          <dt>생성 시각</dt>
          <dd>
            <time dateTime={model.createdAt}>{dateTime(model.createdAt)}</time>
          </dd>
        </div>
      </dl>
      <h3>근거 그래프</h3>
      <dl className="ops-facts">
        <div>
          <dt>마스터</dt>
          <dd>
            v{graph.masterVersion} ·{" "}
            {graph.masterTriples.toLocaleString("ko-KR")}개 삼중항
          </dd>
        </div>
        <div>
          <dt>세션</dt>
          <dd>
            {graph.sessions.toLocaleString("ko-KR")}개 ·{" "}
            {graph.sessionTriples.toLocaleString("ko-KR")}개 삼중항
          </dd>
        </div>
      </dl>
      <p>
        상태 기준: <time dateTime={generatedAt}>{dateTime(generatedAt)}</time>
      </p>
      <p>
        출처: 운영 상태 API · 반영 지연은 자료 기준일과 상태 기준일의 차이예요.
      </p>
    </div>
  );
}
