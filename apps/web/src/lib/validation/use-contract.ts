// 화면마다 독립적인 계약 요청 상태를 관리한다.
import { useEffect, useState } from "react";

export type ContractState<T> = {
  status: "loading" | "ready" | "empty" | "error";
  value?: T;
};

// API 실패는 빈 상태로 두고 계약 위반만 오류 상태로 구분한다.
export function useContract<T>(
  load: (signal: AbortSignal) => Promise<T>,
): ContractState<T> {
  const [state, setState] = useState<ContractState<T>>({ status: "loading" });

  // 늦게 도착한 이전 응답이 현재 화면을 덮지 않도록 요청을 취소한다.
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((value) => setState({ status: "ready", value }))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : "";
        setState({
          status: message.startsWith("API 계약 불일치") ? "error" : "empty",
        });
      });
    return () => controller.abort();
  }, [load]);
  return state;
}
