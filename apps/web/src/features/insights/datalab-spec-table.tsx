// 데이터 활용 명세를 쉬운 용도와 원문 기록으로 나누어 보여 준다.
import type { DatalabSpec } from "@crowdcast/contracts/types";
import type { ContractState } from "../../lib/validation/use-contract";

const PURPOSES: Record<string, string> = {
  "ds-datalab-festival-status":
    "통신 기반 방문객 추정치를 확인해요. 행사장과 집계 구역의 일치 여부는 별도 확인이 필요해요.",
  "ds-kto-visitors-15101972":
    "지역의 평소 방문 규모와 방문객 구성을 파악하는 데 사용해요.",
  "ds-mcst-festival-plans":
    "행사 일정·유형을 확인하고 전년 발표 방문객을 규모 참고 자료로 사용해요.",
};

// 자료 확인일과 분석 계산 시각을 구분하고 원래 용도 설명도 보존한다.
export function DatalabSpecTable({
  state,
  retry,
  datasetIds,
}: {
  state: ContractState<DatalabSpec>;
  retry?: () => void;
  datasetIds?: string[];
}) {
  if (!state.value)
    return (
      <div className="insights-callout">
        <p role={state.status === "error" ? "alert" : "status"}>
          {state.status === "loading"
            ? "자료 활용 기록을 불러오는 중이에요."
            : state.status === "error"
              ? "자료 활용 기록을 불러오지 못했어요. 다시 시도해 주세요."
              : "아직 발행된 자료 활용 기록이 없어요."}
        </p>
        {retry && state.status !== "loading" && (
          <button type="button" onClick={retry}>
            활용 기록 다시 확인
          </button>
        )}
      </div>
    );
  const rows = datasetIds
    ? state.value.rows.filter((row) => datasetIds.includes(row.datasetId))
    : state.value.rows;
  if (!rows.length)
    return (
      <p className="insights-callout">
        선택한 지표에 연결된 자료 활용 기록이 아직 없어요.
      </p>
    );
  return (
    <div className="insights-section-stack">
      <div className="insights-datasets">
        {rows.map((row) => (
          <article className="insights-dataset" key={row.datasetId}>
            <h3>{row.title}</h3>
            <p>{PURPOSES[row.datasetId] ?? row.purpose}</p>
            <dl className="insights-meta">
              <div>
                <dt>자료 지표</dt>
                <dd>{row.metric}</dd>
              </div>
              <div>
                <dt>집계 단위</dt>
                <dd>{row.unit}</dd>
              </div>
              <div>
                <dt>
                  {row.datasetId === "ds-mcst-festival-plans"
                    ? "행사 일정 범위 · 예정 포함"
                    : "원자료 기간"}
                </dt>
                <dd>
                  {row.period.from} ~ {row.period.to}
                </dd>
              </div>
              <div>
                <dt>자료 확인일</dt>
                <dd>{row.confirmedAt}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
