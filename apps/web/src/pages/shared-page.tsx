// 공유 토큰으로 받은 발행 스냅샷을 행동 버튼 없이 읽기 전용으로 표시한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { EmptyState } from "../components/common/empty-state";
import { ErrorState } from "../components/common/error-state";
import { PageHeading } from "../components/common/page-heading";
import { SharedReport } from "../features/my-events/shared-report";
import { getSharedReport } from "../lib/my-events-api";
import "../features/forecast-report/report.css";

// 토큰이 바뀌면 이전 요청을 취소하고 응답 계약을 통과한 문서만 연다.
export function SharedPage() {
  const { token } = useParams();
  const [report, setReport] = useState<ForecastReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) {
      setError("공유 주소가 없어요.");
      return;
    }
    const controller = new AbortController();
    setReport(null);
    setError("");
    getSharedReport(token, controller.signal)
      .then(setReport)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("공유 예보서를 열 수 없어요. 주소를 확인해 주세요.");
      });
    return () => controller.abort();
  }, [token]);
  return (
    <div className="forecast-page page-wrap">
      <PageHeading
        eyebrow="읽기 전용"
        title="공유된 예보서"
        description="발행 당시 예보와 근거를 확인하세요. 참고용 — 담당자 검토 필수"
      />
      {!report && !error && (
        <EmptyState
          message="공유 예보서를 불러오고 있어요."
          action={<span>잠시만 기다려 주세요.</span>}
        />
      )}
      {error && <ErrorState message={error} />}
      {report && <SharedReport report={report} />}
    </div>
  );
}
