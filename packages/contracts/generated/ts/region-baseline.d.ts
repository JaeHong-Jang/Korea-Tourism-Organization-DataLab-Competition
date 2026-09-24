/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 행사 전 기간의 요일별 평시 방문(방문자 API)
 */
export interface RegionBaseline {
  /**
   * 2025년 시군구 코드 체계(방문자 API와 같은 코드)
   */
  sigunguCode: string;
  sigunguName: string;
  period: Period;
  /**
   * @minItems 7
   * @maxItems 7
   */
  weekdayMean: [
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    },
    {
      weekday: number;
      local: number;
      nonlocal: number;
      foreign: number;
    }
  ];
  nonlocalShare: number;
  evidenceId: string;
}
export interface Period {
  from: string;
  to: string;
}
