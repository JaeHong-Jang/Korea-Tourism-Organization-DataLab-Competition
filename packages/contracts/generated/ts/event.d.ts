/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 정규화된 행사
 */
export interface Event {
  id: string;
  name: string;
  type: "불꽃" | "공연" | "대학" | "먹거리" | "꽃" | "전통" | "기타";
  startsAt: string;
  endsAt: string;
  timeOfDay: "주간" | "야간" | "종일" | "미상";
  venue: {
    name: string;
    lat: number;
    lng: number;
  };
  sido: string;
  /**
   * 2025년 시군구 코드(방문자 API와 같다). IRI = http://crowdcast.local/id/<코드>
   */
  sigunguCode: string;
  sigunguName: string;
  fee: "무료" | "유료" | "미상";
  hostType: "지자체" | "민간" | "대학" | "기타";
  budgetKrw: number | null;
  edition: number | null;
  promo: string[];
  hazards: (
    "폭죽" | "불" | "가연성가스" | "석유류" | "산" | "수면" | "차량진입" | "단일출입구" | "무대밀집" | "야간조명부족"
  )[];
  expectedByHost: Quantity | null;
  source: "사용자입력" | "문체부" | "TourAPI" | "데이터랩";
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
