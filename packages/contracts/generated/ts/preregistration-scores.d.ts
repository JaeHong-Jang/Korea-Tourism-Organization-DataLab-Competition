/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 채점판(M6-F4). 채점 불가·취소 건수를 숨기지 않는다
 */
export interface PreregistrationScores {
  registeredAt: string;
  tag: string;
  rulesDoc: string;
  entries: {
    seq: number;
    eventId: string;
    name: string;
    startsAt: string;
    endsAt: string;
    leadDays: number;
    /**
     * 1 소규모 · 2 수립 권고 · 3 수립 대상 · 4 대규모
     */
    level: number;
    dailyMeanP10: number;
    dailyMeanP50: number;
    dailyMeanP90: number;
    actual: Quantity | null;
    status: "채점 완료" | "대기" | "채점 불가" | "취소";
    inInterval: boolean | null;
    levelMatch: boolean | null;
  }[];
  summary: {
    registered: number;
    scored: number;
    inInterval: number;
    unscorable: number;
    cancelled: number;
  };
}
/**
 * 수치 노드. 자리표시자는 id와 필드를 가리킨다
 */
export interface Quantity {
  id: string;
  name: string;
  value: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율";
  timeUnit: "순간" | "일" | "기간누적";
  spatialScope: "행사장" | "행정동" | "시군구";
  valueKind: "사전예상" | "사후집계" | "예측" | "관측";
  estimated: boolean;
  assumptionIds: string[];
  announcedAt: string | null;
}
