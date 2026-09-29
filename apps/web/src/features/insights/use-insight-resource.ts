// 인사이트의 조회 실패와 자료 부재를 구분하고 카드별로 다시 조회한다.
import { useCallback, useEffect, useState } from "react";
import type { ContractState } from "../../lib/validation/use-contract";

// 다른 페이지의 요청 규칙은 유지하면서 인사이트 요청만 독립적으로 관리한다.
export function useInsightResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<ContractState<T>>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  // 재조회나 페이지 이동 전에 시작한 응답이 최신 결과를 덮지 않게 한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision은 사용자의 재조회 요청으로 효과를 다시 실행한다.
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ status: "ready", value });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [load, revision]);
  return { state, retry };
}
