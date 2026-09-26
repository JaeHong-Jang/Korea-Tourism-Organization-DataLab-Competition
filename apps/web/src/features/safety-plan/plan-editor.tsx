// 계획 목차와 섹션 메모, 근거 서랍, 저장 상태를 한 화면에 묶는다.
import type { ForecastReport, Plan } from "@crowdcast/contracts/types";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { ReportDrawer, useEvidenceDrawer } from "../evidence/report-drawer";
import { PlanContents } from "./plan-contents";
import { PlanSection } from "./plan-section";
import { usePlanEditor } from "./use-plan-editor";

// 목차는 표제에 포커스를 주고 스크롤로 바뀐 현재 섹션도 강조한다.
export function PlanEditor({
  initial,
  report,
}: {
  initial: Plan;
  report: ForecastReport;
}) {
  const editor = usePlanEditor(initial);
  const drawer = useEvidenceDrawer();
  const [active, setActive] = useState<string>(initial.sections[0].key);

  // 관찰 가능한 섹션이 바뀌면 목차의 현재 위치를 갱신한다.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id.replace("plan-", ""));
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    for (const section of initial.sections) {
      const node = document.getElementById(`plan-${section.key}`);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [initial]);

  // 목차 이동 뒤 읽기 시작점을 키보드에도 알려 준다.
  const select = (key: string) => {
    setActive(key);
    const heading = document.getElementById(`plan-heading-${key}`);
    heading?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    heading?.focus();
  };
  const saveLabel =
    editor.status === "error"
      ? "저장 실패"
      : editor.status === "saving"
        ? "저장 중…"
        : editor.dirty
          ? "저장 대기 중…"
          : `저장됨 ${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(editor.savedAt))}`;

  return (
    <>
      <div className="plan-toolbar">
        <span role="status">{saveLabel}</span>
        {editor.status === "error" && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void editor.retry()}
          >
            다시 저장
          </Button>
        )}
        {editor.dirty ? (
          <Button
            type="button"
            disabled
            title="메모 저장 후 내려받을 수 있어요."
          >
            docx 받기
          </Button>
        ) : (
          <Button asChild>
            <a
              href={`/api/plans/${encodeURIComponent(editor.plan.id)}/export.docx`}
            >
              docx 받기
            </a>
          </Button>
        )}
      </div>
      <p className="plan-watermark">{editor.plan.watermark}</p>
      <div className="plan-editor-layout">
        <PlanContents
          sections={editor.plan.sections}
          active={active}
          onSelect={select}
        />
        <section className="plan-document" aria-label="계획 초안 편집기">
          <h2>{editor.plan.title}</h2>
          {editor.plan.sections.map((section, index) => (
            <PlanSection
              key={section.key}
              section={section}
              index={index}
              report={report}
              note={editor.notes[index]}
              onNote={editor.editNote}
              onOpen={drawer.open}
            />
          ))}
        </section>
        <ReportDrawer
          report={report}
          selectedId={drawer.selectedId}
          onClose={drawer.close}
        />
      </div>
    </>
  );
}
