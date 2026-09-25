// 실제 읽은 데이터랩 자료만 활용 명세표로 표시한다.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex lint/a11y/noRedundantRoles: 표의 가로 스크롤 영역을 명시적으로 포커스 가능하게 한다.
import type { DatalabSpec } from "@crowdcast/contracts/types";
import type { ContractState } from "../../lib/validation/use-contract";
import { ContractMessage } from "../validation/contract-state";

// 기간과 확인일을 각 행에 두어 출처를 확인할 수 있게 한다.
export function DatalabSpecTable({
  state,
}: {
  state: ContractState<DatalabSpec>;
}) {
  if (!state.value)
    return (
      <ContractMessage
        state={state}
        empty="데이터랩 활용 명세는 데이터 수집이 끝나면 채워져요 · 9/27"
      />
    );
  if (!state.value.rows.length)
    return (
      <p className="validation-state">
        확인된 데이터랩 활용 기록이 아직 없어요.
      </p>
    );
  return (
    <section
      className="validation-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="데이터랩 활용 명세 표, 좌우로 스크롤"
    >
      <table>
        <thead>
          <tr>
            <th>메뉴·자료</th>
            <th>지표</th>
            <th>기간</th>
            <th>단위</th>
            <th>용도</th>
            <th>확인일</th>
          </tr>
        </thead>
        <tbody>
          {state.value.rows.map((row) => (
            <tr key={row.datasetId}>
              <th>{row.datalabMenu ?? row.title}</th>
              <td>{row.metric}</td>
              <td>
                {row.period.from}~{row.period.to}
              </td>
              <td>{row.unit}</td>
              <td>{row.purpose}</td>
              <td>{row.confirmedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
