// 최초 예보서의 발행 문장을 중복 없이 계획 섹션에 배치하고 수치 칸을 잠근다
// @ts-expect-error 계약의 정규 숫자 표기는 JavaScript로 배포된다
import { canonical } from "@crowdcast/contracts/rules/card-projection.mjs";
import type {
  Claim,
  ForecastReport,
  Plan,
  PlanSection,
} from "@crowdcast/contracts/types";
import { MODEL_NOTICE, REVIEW_NOTICE } from "../verification/skeptic.js";

type SectionKey = PlanSection["key"];

// 계약 enum 순서와 담당자가 채울 이유를 본문 밖의 제목 안내로 고정한다
const sections: [SectionKey, string, string?][] = [
  ["overview", "행사 개요"],
  ["organization", "안전관리 조직", "담당 조직과 연락 체계를 채워야 해요"],
  ["crowd-timeline", "시간대별 인파"],
  ["routes-evacuation", "동선과 대피"],
  ["staffing", "안전관리 인력", "인력 산정 근거를 담당자가 확인해야 해요"],
  ["traffic-parking", "교통과 주차"],
  ["medical-toilets", "의료와 화장실"],
  [
    "weather-emergency",
    "기상과 비상 대응",
    "기상 자료와 비상 대응 계획을 채워야 해요",
  ],
  ["non-crowd-risks", "인파 외 위험 요소"],
];

// 매뉴얼 권고는 문장에 섞인 교통·출구 키워드보다 근거 규칙의 담당 섹션을 우선한다
const ruleSections: Record<string, SectionKey> = {
  "rule-check-staff-plan": "staffing",
  "rule-check-staff-distinct": "staffing",
  "rule-check-staff-focus": "staffing",
  "rule-check-org-chart": "organization",
  "rule-check-org-hq": "organization",
  "rule-check-capacity": "routes-evacuation",
};

// 권고 근거가 가리키는 체크리스트 규칙을 먼저 찾고 나머지는 기존 키워드로 배치한다
function sectionFor(claim: Claim, report: ForecastReport): SectionKey | null {
  if (claim.claimType === "수치") return "crowd-timeline";
  if (claim.claimType === "판정") {
    const hazard = report.forecast.judgment.reasons.some(
      (reason) =>
        reason.ruleId === "rule-legal-hazard" &&
        typeof reason.evidenceId === "string" &&
        claim.evidenceIds.includes(reason.evidenceId),
    );
    return hazard ? "non-crowd-risks" : "overview";
  }
  if (claim.text === REVIEW_NOTICE || claim.text === MODEL_NOTICE)
    return "overview";
  if (claim.claimType !== "권고") return null;
  for (const item of report.forecast.judgment.checklist) {
    const section = ruleSections[item.ruleId];
    if (
      section &&
      item.evidenceIds.some((id) => claim.evidenceIds.includes(id))
    )
      return section;
  }
  if (/대피|동선/.test(claim.text)) return "routes-evacuation";
  if (/교통|주차/.test(claim.text)) return "traffic-parking";
  if (/의료|화장실/.test(claim.text)) return "medical-toilets";
  return "non-crowd-risks";
}

// 렌더링에 실제 사용된 수치 칸만 정규 숫자 표기와 원래 단위로 잠근다
function lockedFields(
  claims: Claim[],
  report: ForecastReport,
): PlanSection["lockedFields"] {
  const fields = new Map<string, PlanSection["lockedFields"][number]>();
  const quantities = [
    report.forecast.dailyMean,
    report.forecast.peakConcurrent,
  ];
  for (const claim of claims) {
    for (const binding of claim.placeholders) {
      const quantity = quantities.find(
        (item) => item.id === binding.quantityId,
      );
      const value = quantity?.[binding.field];
      if (!quantity || typeof value !== "number" || !Number.isFinite(value))
        throw new Error("계획 섹션의 수치 참조가 없습니다");
      fields.set(`${quantity.id}:${binding.field}`, {
        name: binding.field,
        quantityId: quantity.id,
        value: `${canonical(value)} ${quantity.unit}`,
      });
    }
  }
  return [...fields.values()];
}

// 발행 상태·예보 범위·근거가 맞는 스냅샷 문장만 원래 id와 원문으로 재사용한다
export function planSections(report: ForecastReport): Plan["sections"] {
  const assigned = new Map<SectionKey, Claim[]>();
  const seen = new Set<string>();
  const evidenceIds = new Set(report.evidence.map((item) => item.id));
  for (const claim of report.claims) {
    if (
      seen.has(claim.id) ||
      claim.status !== "published" ||
      claim.rendered === null ||
      claim.forecastId !== report.forecastId ||
      claim.sessionId !== report.sessionId ||
      !claim.evidenceIds.length ||
      !claim.evidenceIds.every((id) => evidenceIds.has(id))
    )
      continue;
    seen.add(claim.id);
    const key = sectionFor(claim, report);
    if (key) assigned.set(key, [...(assigned.get(key) ?? []), claim]);
  }

  // 자료 공백은 본문에 새 문장을 넣지 않고 섹션 상태와 제목으로 알린다
  return sections.map(([key, title, pending]) => {
    const claims = assigned.get(key) ?? [];
    const reason =
      (claims.length ? undefined : pending) ??
      (key === "crowd-timeline" &&
      (!report.forecast.peakHours || !report.forecast.hourlyProfile.length)
        ? "시간대별 분포 자료가 없어 담당자가 채워야 해요"
        : !claims.length
          ? "이 주제의 발행 문장이 없어 담당자가 채워야 해요"
          : undefined);
    return {
      key,
      title: reason ? `${title} — ${reason}` : title,
      status: reason ? "검토 필요" : "작성됨",
      claimIds: claims.map((claim) => claim.id),
      body: claims.map((claim) => claim.rendered).join("\n"),
      lockedFields: lockedFields(claims, report),
    };
  }) as Plan["sections"];
}
