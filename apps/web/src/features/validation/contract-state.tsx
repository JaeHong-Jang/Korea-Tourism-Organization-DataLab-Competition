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
    <ErrorState message="자료를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요." />
  );
}
