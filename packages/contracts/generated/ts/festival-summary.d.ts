/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 미니 대한민국·행사 목록 카드
 */
export interface FestivalSummary {
  eventId: string;
  forecastId: string;
  name: string;
  type: "불꽃" | "공연" | "대학" | "먹거리" | "꽃" | "전통" | "기타";
  startsAt: string;
  endsAt: string;
  /**
   * 2025년 시군구 코드(방문자 API와 같다). IRI = http://crowdcast.local/id/<코드>
   */
  sigunguCode: string;
  sigunguName: string;
  lat: number;
  lng: number;
  /**
   * 1 소규모 · 2 수립 권고 · 3 수립 대상 · 4 대규모
   */
  level: number;
  peakP10: number;
  peakP50: number;
  peakP90: number;
  pOver1000: number;
  ood: boolean;
  /**
   * 이 예보를 만든 사용 모델의 검증 상태(reports/backtest/promoted.json의 verdict, 06 §8). 미검증이면 지도·목록에 '골든 사례 0건 — 사례 재현 검증 전 임시 사용'을 표시한다. 없으면 표시 근거가 없는 것으로 본다(선택 필드 — 9/25 추가).
   */
  modelVerdict?: "통과" | "미검증";
}
