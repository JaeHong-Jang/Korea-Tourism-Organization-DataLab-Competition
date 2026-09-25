// 발행 예보서에서 계획 초안을 준비하고 편집기 상태를 보여 준다.
import type { ForecastReport, Plan } from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ErrorState } from "../components/common/error-state";
import { PageHeading } from "../components/common/page-heading";
import { PetAvatar } from "../components/pets";
import { Button } from "../components/ui/button";
import { loadPlan } from "../features/safety-plan/api";
import { PlanEditor } from "../features/safety-plan/plan-editor";
import "../features/safety-plan/plan.css";

type PlanState =
  | { status: "loading"; retrying?: boolean }
  | { status: "ready"; plan: Plan; report: ForecastReport }
  | { status: "error"; message: string };

// 경로가 바뀌면 이전 요청을 취소하고 새 초안과 예보 스냅샷을 읽는다.
export function PlanPage() {
  const { forecastId } = useParams();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PlanState>({ status: "loading" });
  useEffect(() => {
    if (!forecastId) {
      setState({ status: "error", message: "예보 주소가 없어요." });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading", retrying: attempt > 0 });
    loadPlan(forecastId, controller.signal)
      .then(({ plan, report }) => setState({ status: "ready", plan, report }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "초안을 열 수 없어요.",
          });
      });
    return () => controller.abort();
  }, [forecastId, attempt]);
  return (
    <div className="page-wrap regular-page plan-page">
      <PageHeading
        eyebrow="S4 · 예보 결과를 계획으로"
        title="계획 초안"
        description="발행 문장과 수치는 그대로 두고, 확인할 내용은 작성자 메모에 적어 주세요."
      />
      {state.status === "loading" && (
        <div className="kit-screen-state" role="status">
          <PetAvatar agentId="plan-writer" state="working" size={96} />
          <p>
            {state.retrying
              ? "계획 초안을 다시 불러오고 있어요."
              : "계획 초안을 불러오고 있어요."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            다시 불러오기
          </Button>
        </div>
      )}
      {state.status === "error" && (
        <ErrorState
          message={state.message}
          action={
            <Button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              다시 시도
            </Button>
          }
        />
      )}
      {state.status === "ready" && (
        <PlanEditor
          key={state.plan.id}
          initial={state.plan}
          report={state.report}
        />
      )}
    </div>
  );
}
