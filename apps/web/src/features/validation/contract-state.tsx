// 자료의 로딩·미구현·계약 오류를 구분해 안내한다.
import type { ContractState } from "../../lib/validation/use-contract";

// 값이 확인되기 전에는 수치를 암시하는 자리표시를 그리지 않는다.
export function ContractMessage({
  state,
  empty,
}: {
  state: ContractState<unknown>;
  empty: string;
}) {
  if (state.status === "ready") return null;
  const message =
    state.status === "loading"
      ? "자료를 불러오는 중이에요."
      : state.status === "empty"
        ? empty
        : "자료 형식을 확인할 수 없어요. 잠시 뒤 다시 확인해 주세요.";
  return (
    <p
      className="validation-state"
      role={state.status === "error" ? "alert" : "status"}
    >
      {message}
    </p>
  );
}
