// 정규화한 행사 초안을 만들고 계약상 빠진 값과 확인 질문을 계산한다
import type { EventDraft } from "@crowdcast/contracts/types";
import { normalizeBudget } from "./budget.js";
import { addDays, normalizeDates } from "./date.js";
import { normalizeEventType } from "./event-type.js";
import type { ExtractedFields } from "./extraction.js";
import { normalizeFee } from "./fee.js";
import { normalizeHost } from "./organizer.js";
import { normalizeTime } from "./time.js";
import { normalizeVenue } from "./venue.js";

// 원문 추출 실패 시에도 폼에서 사용할 완전한 계약 객체를 돌려준다
export function emptyDraft(): EventDraft {
  return calculateMissing({
    name: null,
    type: null,
    startsAt: null,
    endsAt: null,
    timeOfDay: null,
    venueText: null,
    sigunguCode: null,
    sigunguName: null,
    fee: null,
    hostType: null,
    budgetKrw: null,
    promo: [],
    hazards: [],
    missing: [],
    ambiguities: [],
  });
}

// missing의 이름과 순서는 계약 enum을 따르고 미상 요금·모호한 장소도 빠진 값으로 센다
function calculateMissing(draft: EventDraft): EventDraft {
  const values = {
    name: draft.name,
    type: draft.type,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    venue: draft.ambiguities.some((item) => item.field === "venue")
      ? null
      : draft.venueText,
    fee: draft.fee === "미상" ? null : draft.fee,
    budgetKrw: draft.budgetKrw,
  };
  draft.missing = (Object.keys(values) as EventDraft["missing"]).filter(
    (key) => values[key] === null,
  );
  return draft;
}

// 시각이 없으면 날짜를 자정으로 조작하지 않고 시작·종료 일시를 미확정으로 둔다
export function normalizeDraft(
  fields: ExtractedFields,
  today: string,
): EventDraft {
  const dates = normalizeDates(fields.dateText, today, fields.timeText);
  const hours = normalizeTime(fields.timeText);
  const venue = normalizeVenue(fields.venueText);
  // 해석하지 못한 날짜는 임의 후보 날짜 대신 직접 입력·미정 선택지로 확인한다
  const unresolvedDate =
    fields.dateText &&
    !dates.start &&
    fields.dateText.replace(/\s/g, "") !== fields.timeText?.replace(/\s/g, "");
  const ambiguities: EventDraft["ambiguities"] = [...venue.ambiguities];
  if (unresolvedDate)
    ambiguities.push({
      field: "startsAt",
      candidates: [
        { label: "정확한 날짜 직접 입력", value: "manual" },
        { label: "일정 미정", value: "undecided" },
      ],
    });
  const startsAt =
    dates.start && hours.start ? `${dates.start}T${hours.start}+09:00` : null;
  const endDate =
    dates.end && hours.nextDay && dates.end === dates.start
      ? addDays(dates.end, 1)
      : dates.end;
  const endsAt = endDate && hours.end ? `${endDate}T${hours.end}+09:00` : null;
  return calculateMissing({
    name: fields.name,
    type: normalizeEventType(fields.typeText),
    startsAt,
    endsAt,
    timeOfDay: hours.timeOfDay,
    venueText: fields.venueText,
    ...venue,
    ambiguities,
    fee: normalizeFee(fields.feeText),
    hostType: normalizeHost(fields.hostText),
    budgetKrw: normalizeBudget(fields.budgetText),
    promo: fields.promo,
    hazards: fields.hazards,
    missing: [],
  });
}

// 계약에 없는 hostType 누락도 질문에는 포함하되 missing enum을 늘리지 않는다
export function draftQuestions(
  draft: EventDraft,
): { field: string; question: string }[] {
  const labels: Record<EventDraft["missing"][number], string> = {
    name: "행사 이름",
    type: "행사 유형",
    startsAt: "시작 날짜와 시각",
    endsAt: "종료 날짜와 시각",
    venue: "행사장과 시도·시군구",
    fee: "입장 요금",
    budgetKrw: "행사 예산",
  };
  return [
    ...draft.missing.map((field) => ({
      field,
      question: `${labels[field]}을 확인해 주세요.`,
    })),
    ...(draft.hostType === null
      ? [{ field: "hostType", question: "주최 유형을 확인해 주세요." }]
      : []),
  ];
}
