// 현재 상담 행사와 일시·장소를 작업판보다 먼저 보여 준다.
import type { EventDraft } from "@crowdcast/contracts/types";
import { formatDraftDate } from "./event-draft-card";
import "./consult-festival-heading.css";

// 새 행사 정보를 받기 전에는 이전 행사 이름 대신 확인 상태를 표시한다.
export function ConsultFestivalHeading({
  draft,
  busy,
  needsAnswer,
}: {
  draft: EventDraft | null;
  busy: boolean;
  needsAnswer: boolean;
}) {
  return (
    <section
      className="consult-festival-heading"
      aria-label="현재 상담 행사"
      aria-live="polite"
    >
      <div className="consult-festival-heading__top">
        <span>현재 상담 행사</span>
        <span className="consult-festival-heading__status">
          {busy
            ? "예보 상담 진행 중"
            : needsAnswer
              ? "추가 확인 필요"
              : "상담 내용"}
        </span>
      </div>
      <h2>
        {draft?.name ||
          (busy ? "행사 정보를 확인하고 있어요" : "상담할 행사를 알려 주세요")}
      </h2>
      {draft && (
        <dl>
          <div>
            <dt>일정</dt>
            <dd>
              {draft.startsAt ? formatDraftDate(draft.startsAt) : "확인 필요"}
              {draft.endsAt && draft.endsAt !== draft.startsAt
                ? ` ~ ${formatDraftDate(draft.endsAt)}`
                : ""}
            </dd>
          </div>
          <div>
            <dt>장소</dt>
            <dd>{draft.venueText || draft.sigunguName || "확인 필요"}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
