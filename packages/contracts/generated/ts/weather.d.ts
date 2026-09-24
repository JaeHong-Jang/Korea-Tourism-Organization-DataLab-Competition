/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 기상청 실황·예보(없으면 source 없음)
 */
export interface Weather {
  lat: number;
  lng: number;
  at: string;
  sky: "맑음" | "구름많음" | "흐림" | null;
  pty: "없음" | "비" | "비/눈" | "눈" | "소나기" | null;
  temp: number | null;
  pop: number | null;
  source: "초단기실황" | "단기예보" | "중기예보" | "없음";
  fetchedAt: string | null;
}
