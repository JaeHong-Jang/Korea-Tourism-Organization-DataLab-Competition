// 행사 초안의 확정 값과 질문 대기 항목을 읽기 전용 칩으로 보여 준다.
import type { EventDraft } from "@crowdcast/contracts/types";
import { useState } from "react";
import { EmptyState } from "../../components/common/empty-state";
import { Button } from "../../components/ui/button";

const fields: { key: keyof EventDraft; label: string }[] = [
  { key: "name", label: "행사명" },
  { key: "type", label: "유형" },
  { key: "startsAt", label: "시작" },
  { key: "endsAt", label: "종료" },
  { key: "venueText", label: "장소" },
  { key: "fee", label: "요금" },
  { key: "hostType", label: "주최" },
  { key: "hazards", label: "위험요소" },
];

// 전송용 ISO 값은 유지하고 한국어 날짜와 시각만 화면에 표시한다.
export function formatDraftDate(value: string): string {
  const dateOnly =
    /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const weekday = "일월화수목금토"[
      new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day)),
      ).getUTCDay()
    ];
    return `${Number(month)}월 ${Number(day)}일(${weekday})`;
  }

  // 시차와 소수 초가 있는 계약 일시를 한국 시각으로 변환해 표시한다.
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${Number(part("month"))}월 ${Number(part("day"))}일(${part("weekday")}) ${part("hour")}:${part("minute")}`;
}

// 확정 칩은 현재 게이트웨이에서 수정되지 않으므로 새 상담 안내만 연다.
export function EventDraftCard({
  draft,
  pendingFields,
}: {
  draft: EventDraft | null;
  pendingFields: string[];
}) {
  const [notice, setNotice] = useState(false);
  if (!draft)
    return (
      <EmptyState
        message="행사 내용을 보내면 확인한 항목이 여기에 모여요."
        action={
          <button
            type="button"
            onClick={() => document.getElementById("consult-text")?.focus()}
          >
            행사 설명하기
          </button>
        }
      />
    );
  return (
    <div>
      <div className="consult-field-list">
        {fields.map(({ key, label }) => {
          const raw = draft[key];
          const pending =
            pendingFields.includes(key) ||
            (pendingFields.includes("time") &&
              (key === "startsAt" || key === "endsAt"));
          const missing =
            key === "hazards" ? pending : raw == null || raw === "";
          const shown =
            key === "hazards" && Array.isArray(raw)
              ? raw.join(", ") || (pending ? "확인 필요" : "해당 없음")
              : typeof raw === "string" &&
                  (key === "startsAt" || key === "endsAt")
                ? formatDraftDate(raw)
                : raw == null
                  ? ""
                  : String(raw);
          return (
            <button
              type="button"
              key={key}
              className={`consult-field${missing ? " consult-field--missing" : ""}`}
              onClick={() => setNotice(true)}
            >
              <strong>{label}</strong> {shown || "확인 필요"}
            </button>
          );
        })}
      </div>
      {notice && (
        <div className="consult-edit">
          <p>고치려면 새 상담을 시작해 주세요.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.assign("/consult")}
          >
            새 상담
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setNotice(false)}
          >
            닫기
          </Button>
        </div>
      )}
    </div>
  );
}
