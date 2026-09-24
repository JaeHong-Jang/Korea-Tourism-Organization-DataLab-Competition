/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 기록관이 찾은 사례. 단위가 같을 때만 비교한다
 */
export interface SimilarEvent {
  eventId: string;
  name: string;
  year: number;
  sigunguName: string;
  type: "불꽃" | "공연" | "대학" | "먹거리" | "꽃" | "전통" | "기타";
  measured: Quantity | null;
  announced: Quantity | null;
  unitsComparable: boolean;
  similarity: number;
  evidenceId: string;
}
/**
 * 수치 노드(09 §4). 문장의 자리표시자는 이 id와 필드를 가리킨다
 */
export interface Quantity {
  id: string;
  name?: string;
  value?: number | null;
  p10?: number | null;
  p50?: number | null;
  p90?: number | null;
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율";
  timeUnit: "순간" | "일" | "기간누적";
  spatialScope: "행사장" | "행정동" | "시군구";
  kind: "사전예상" | "사후집계" | "예측" | "관측";
  /**
   * 가정이 들어간 환산값이면 true
   */
  estimated: boolean;
  assumptionIds?: string[];
}
