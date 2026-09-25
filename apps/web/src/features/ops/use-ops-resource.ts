// 운영 카드별 요청 실패와 계약 오류를 독립 상태로 보관한다.
import { useEffect, useState } from "react";

export type OpsResource<T> =
  | { phase: "loading" }
  | { phase: "ready"; value: T }
  | { phase: "error"; message: string };

// 한 카드의 오류가 다른 카드의 로딩이나 정상 결과를 지우지 않게 한다.
export function useOpsResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
): OpsResource<T> {
  const [state, setState] = useState<OpsResource<T>>({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((value) => setState({ phase: "ready", value }))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          phase: "error",
          message:
            reason instanceof Error ? reason.message : "자료를 읽지 못했어요.",
        });
      });
    return () => controller.abort();
  }, [load]);
  return state;
}
