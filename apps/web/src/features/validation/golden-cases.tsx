// 골든 사례의 인원 단위와 비교 가능 여부를 보여 준다.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex lint/a11y/noRedundantRoles: 표의 가로 스크롤 영역을 명시적으로 포커스 가능하게 한다.

import type { BacktestSummary } from "@crowdcast/contracts/types";
import { formatQuantity } from "../../lib/format";
import type { ContractState } from "../../lib/validation/use-contract";
import { ContractMessage } from "./contract-state";

// 누적·순간 인원은 일평균 예보와 직접 같은 점수로 읽지 않게 한다.
export function GoldenCases({
  state,
}: {
  state: ContractState<BacktestSummary>;
}) {
  if (!state.value)
    return (
      <ContractMessage state={state} empty="골든 사례 자료가 아직 없어요." />
    );
  if (!state.value.golden.length)
    return (
      <div className="validation-content">
        <strong>골든 사례 0건 — 사례 재현 검증 전 임시 사용</strong>
        <p>골든 사례 기사 확보 전이라 사례 재현 결과를 보여 드릴 수 없어요.</p>
      </div>
    );
  return (
    <section
      className="validation-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="골든 사례 표, 좌우로 스크롤"
    >
      <table>
        <thead>
          <tr>
            <th>행사</th>
            <th>주최 측 예상</th>
            <th>예보 p50</th>
            <th>실측</th>
            <th>비교</th>
          </tr>
        </thead>
        <tbody>
          {state.value.golden.map((item) => (
            <tr key={item.eventId}>
              <th>{item.name}</th>
              <td>
                {item.hostExpected
                  ? formatQuantity(item.hostExpected)
                  : "자료 없음"}
              </td>
              <td>
                {item.model.p50.toLocaleString("ko-KR")} {item.model.unit} ·{" "}
                {item.model.timeUnit}
              </td>
              <td>{formatQuantity(item.actual)}</td>
              <td>{item.unitsComparable ? item.verdict : "정성 비교"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
