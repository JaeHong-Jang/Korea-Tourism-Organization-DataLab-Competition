// 선택 식별자별 요청을 취소하고 이전 응답이 새 예보에 섞이지 않게 한다.
import { useEffect, useState } from "react";

type Resource<T> = {
  key: string | null;
  status: "idle" | "loading" | "ready" | "error";
  value?: T;
  error?: string;
};

// 식별자가 바뀐 첫 렌더부터 이전 자료를 숨기고 실패한 요청만 재시도한다.
export function useGraphResource<T>(
  key: string | null,
  load: (key: string, signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<Resource<T>>({
    key: null,
    status: "idle",
  });
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt는 같은 자료를 재요청하는 신호다.
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    setState({ key, status: "loading" });
    load(key, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted)
          setState({ key, status: "ready", value });
      },
      (reason: unknown) => {
        if (!controller.signal.aborted)
          setState({
            key,
            status: "error",
            error:
              reason instanceof Error
                ? reason.message
                : "자료를 불러오지 못했어요.",
          });
      },
    );
    return () => controller.abort();
  }, [key, load, attempt]);
  const current: Resource<T> =
    key === null
      ? { key, status: "idle" }
      : state.key === key
        ? state
        : { key, status: "loading" };
  return { ...current, retry: () => setAttempt((value) => value + 1) };
}
