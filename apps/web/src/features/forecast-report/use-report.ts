// 발행 스냅샷 하나의 로딩·오류·완료 상태를 관리한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { getForecastReport } from "../../lib/api-client";

type ReportState =
  | { status: "loading"; report: null; error: "" }
  | { status: "ready"; report: ForecastReport; error: "" }
  | { status: "error"; report: null; error: string };

// 주소가 바뀌면 이전 요청을 취소하고 새 스냅샷을 검증해 받는다.
export function useReport(forecastId: string | undefined): ReportState {
  const [state, setState] = useState<ReportState>({
    status: "loading",
    report: null,
    error: "",
  });
  useEffect(() => {
    if (!forecastId) {
      setState({ status: "error", report: null, error: "예보 주소가 없어요." });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading", report: null, error: "" });
    getForecastReport(forecastId, controller.signal)
      .then((report) => setState({ status: "ready", report, error: "" }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            report: null,
            error:
              error instanceof Error ? error.message : "예보서를 열 수 없어요.",
          });
      });
    return () => controller.abort();
  }, [forecastId]);
  return state;
}
