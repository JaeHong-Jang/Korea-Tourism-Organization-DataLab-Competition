// 자료의 로딩·미구현·계약 오류를 구분해 안내한다.

import { EmptyState } from "../../components/common/empty-state";
import { ErrorState } from "../../components/common/error-state";
import { LoadingState } from "../../components/common/loading-state";
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
  if (state.status === "loading") return <LoadingState />;
  if (state.status === "empty") return <EmptyState message={empty} />;
  return (
    <ErrorState message="자료 형식을 확인할 수 없어요. 잠시 뒤 다시 확인해 주세요." />
  );
}
