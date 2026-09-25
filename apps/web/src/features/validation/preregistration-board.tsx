// 사전 등록 채점과 독립적인 원장 검증 행동을 제공한다.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex lint/a11y/noRedundantRoles: 표의 가로 스크롤 영역을 명시적으로 포커스 가능하게 한다.
import type { PreregistrationScores } from "@crowdcast/contracts/types";
import { useState } from "react";
import { formatQuantity } from "../../lib/format";
import { getLedger, getLedgerVerification } from "../../lib/validation/api";
import type { ContractState } from "../../lib/validation/use-contract";
import { ContractMessage } from "./contract-state";

// 원장 목록의 마지막 해시까지 확인해 검증 응답에 없는 값을 안전하게 표시한다.
export function PreregistrationBoard({
  state,
}: {
  state: ContractState<PreregistrationScores>;
}) {
  const [verification, setVerification] = useState<string>("");
  const [working, setWorking] = useState(false);

  // 빈 채점판에서도 해시 체인 검증을 실행할 수 있게 둔다.
  async function verify() {
    setWorking(true);
    setVerification("");
    try {
      const result = await getLedgerVerification();
      if (!result.valid) {
        setVerification(
          `검증 실패 · 손상 위치 ${result.brokenAt ?? "알 수 없음"}`,
        );
        return;
      }
      const ledger = await getLedger();
      if (ledger.length !== result.count) throw new Error("원장 건수 불일치");
      setVerification(
        `검증 통과 · ${result.count}건 · 마지막 해시 ${ledger.at(-1)?.hash.slice(0, 12) ?? "없음"}`,
      );
    } catch {
      setVerification("원장 검증 결과를 확인하지 못했어요.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="validation-content">
      {state.value ? (
        <>
          <p>
            등록 {state.value.summary.registered}건 · 채점{" "}
            {state.value.summary.scored}건 · 구간 포함{" "}
            {state.value.summary.inInterval}건 · 채점 불가{" "}
            {state.value.summary.unscorable}건 · 취소{" "}
            {state.value.summary.cancelled}건
          </p>
          <p>
            등록 {state.value.registeredAt} · {state.value.tag}
          </p>
          {state.value.entries.length > 0 && (
            <section
              className="validation-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="사전 등록 채점 표, 좌우로 스크롤"
            >
              <table>
                <thead>
                  <tr>
                    <th>행사</th>
                    <th>상태</th>
                    <th>실측</th>
                    <th>구간 포함</th>
                  </tr>
                </thead>
                <tbody>
                  {state.value.entries.map((item) => (
                    <tr key={item.seq}>
                      <th>{item.name}</th>
                      <td>{item.status}</td>
                      <td>
                        {item.actual ? formatQuantity(item.actual) : "대기"}
                      </td>
                      <td>
                        {item.inInterval == null
                          ? "대기"
                          : item.inInterval
                            ? "포함"
                            : "벗어남"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      ) : (
        <ContractMessage
          state={state}
          empty="9/29 사전 등록 뒤 채점은 실측 공개(약 31일 뒤) 이후에 나와요."
        />
      )}
      <button
        type="button"
        className="validation-primary"
        onClick={verify}
        disabled={working}
      >
        {working ? "검증 중" : "해시 체인 검증"}
      </button>
      {verification && <p role="status">{verification}</p>}
    </div>
  );
}
