// 예보서 인쇄·링크 복사·계획 초안 docx를 제공한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { useState } from "react";
import { Button } from "../../components/ui/button";

type PlanState = "idle" | "loading" | "downloaded" | "unavailable" | "error";

// 계획 경로의 성공 응답만 같은 출처의 docx 내려받기로 연결한다.
export async function requestPlan(
  forecastId: string,
  fetcher: typeof fetch = fetch,
): Promise<
  | { status: "ready"; href: string }
  | { status: "unavailable" }
  | { status: "error" }
> {
  try {
    const response = await fetcher(
      `/api/forecasts/${encodeURIComponent(forecastId)}/plan`,
      { method: "POST" },
    );
    if (response.status === 404) return { status: "unavailable" };
    if (!response.ok) return { status: "error" };
    const value: unknown = await response.json();
    if (
      !value ||
      typeof value !== "object" ||
      !("docxHref" in value) ||
      typeof value.docxHref !== "string" ||
      !value.docxHref.startsWith("/api/") ||
      !value.docxHref.endsWith(".docx")
    )
      return { status: "error" };
    return { status: "ready", href: value.docxHref };
  } catch {
    return { status: "error" };
  }
}

// 결과에 따라 버튼을 비활성화하고 이유를 바로 옆에 알린다.
export function ReportToolbar({ report }: { report: ForecastReport }) {
  const [plan, setPlan] = useState<PlanState>("idle");
  const [copy, setCopy] = useState("");
  const reason =
    plan === "unavailable"
      ? "계획 초안 경로가 아직 없어요."
      : plan === "error"
        ? "계획 초안을 받지 못했어요. 예보서를 새로 열어 주세요."
        : plan === "downloaded"
          ? "계획 초안 다운로드를 시작했어요."
          : "";
  return (
    <div className="report-toolbar">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => window.print()}
      >
        인쇄
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopy("링크를 복사했어요.");
          } catch {
            setCopy("링크를 복사하지 못했어요.");
          }
        }}
      >
        링크 복사
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!report.publishedAt || plan !== "idle"}
        onClick={async () => {
          setPlan("loading");
          const result = await requestPlan(report.forecastId);
          if (result.status !== "ready") {
            setPlan(result.status);
            return;
          }
          setPlan("downloaded");
          const link = document.createElement("a");
          link.href = result.href;
          document.body.append(link);
          link.click();
          link.remove();
        }}
      >
        계획 초안 docx 받기
      </Button>
      {report.publishedAt && (
        <a href={`/f/${encodeURIComponent(report.forecastId)}/plan`}>
          계획 초안 편집하기
        </a>
      )}
      <span role="status">
        {reason ||
          copy ||
          (plan === "loading" ? "계획 초안을 준비하고 있어요." : "")}
      </span>
    </div>
  );
}
