// 현재 발행 예보의 근거에 맞는 질문과 준비 항목·문서 행동을 구분한다.
import type { EventDraft, ForecastReport } from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getForecastReport } from "../../lib/api-client";
import { whatIfChips } from "../consult-chat/followup-chips";
import { PreparationChecklist } from "./preparation-checklist";
import type { PreparationAction } from "./preparation-groups";
import "./assistant-next-actions.css";

// 지원되는 질문만 전송하고 날짜·시간·요금 변경은 별도 펼침 안에 둔다.
export function AssistantNextActions({
  forecastId,
  draft,
  suggestions,
  onAsk,
}: {
  forecastId: string;
  draft: EventDraft | null;
  suggestions: PreparationAction[];
  onAsk: (text: string) => void;
}) {
  const [report, setReport] = useState<ForecastReport | null>(null);
  const [reportError, setReportError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setReportError(false);
    getForecastReport(forecastId, controller.signal)
      .then(setReport)
      .catch(() => {
        if (!controller.signal.aborted) setReportError(true);
      });
    return () => controller.abort();
  }, [forecastId]);
  const weather = report?.forecast.assumptions.some(
    (item) => item.id === "as-weather-adjustment",
  );
  const href = `/f/${encodeURIComponent(forecastId)}`;
  const tasks = suggestions.some((item) => !item.href)
    ? suggestions
    : (report?.forecast.judgment.checklist.map((item) => ({
        id: item.id,
        label: item.text,
      })) ?? []);
  return (
    <div className="assistant-next">
      <section className="assistant-next__section" aria-label="더 알아보기">
        <h3>더 알아보기</h3>
        <div className="consult-choices">
          <button type="button" onClick={() => onAsk("왜 이렇게 많아?")}>
            왜 이렇게 예측했나요?
          </button>
          {!!report?.similar.length && (
            <button type="button" onClick={() => onAsk("비슷한 행사는?")}>
              비슷한 축제는 어땠나요?
            </button>
          )}
          {weather && (
            <button type="button" onClick={() => onAsk("비 오면?")}>
              비가 오면 어떻게 되나요?
            </button>
          )}
        </div>
        {!weather && (
          <p className="assistant-next__weather-note" role="status">
            {reportError
              ? "날씨 근거를 확인하지 못했어요. 예보서에서 확인해 주세요."
              : !report
                ? "날씨 근거를 확인하고 있어요."
                : "이 예보에는 날씨 자료가 포함되지 않아 ‘비가 오면?’ 질문을 사용할 수 없어요. 날씨 자료가 확보된 뒤 다시 예보해야 합니다."}
          </p>
        )}
        <details className="assistant-next__conditions">
          <summary>날짜·시간·요금을 바꾸면?</summary>
          <div className="consult-choices">
            {whatIfChips(draft)
              .slice(0, 3)
              .map((text) => (
                <button type="button" key={text} onClick={() => onAsk(text)}>
                  {text}
                </button>
              ))}
          </div>
        </details>
      </section>
      <PreparationChecklist
        key={forecastId}
        forecastId={forecastId}
        actions={tasks}
      />
      <nav className="assistant-next__section" aria-label="예보 활용">
        <h3>예보 활용</h3>
        <div className="consult-choices">
          <Link to={href}>예보서 보기</Link>
          <Link to={`${href}/plan`}>계획 초안 만들기</Link>
          <Link to={`/my?forecastId=${encodeURIComponent(forecastId)}`}>
            내 행사에 저장
          </Link>
        </div>
      </nav>
    </div>
  );
}
