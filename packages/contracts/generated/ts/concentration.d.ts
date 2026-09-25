/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 한국관광공사 관광지 집중률 방문자 추이 예측(15128555) — 시군구 관광지의 조회일부터 30일 예측, 최성수기=100 상대치
 */
export interface Concentration {
  sigunguCode: string;
  from: string;
  to: string;
  /**
   * ok=행사일이 예측 범위 안, out_of_window=행사일이 30일 예측 범위 밖, empty=시군구 관광지 예측 없음
   */
  status: "ok" | "out_of_window" | "empty";
  /**
   * API 응답을 처음 받은 시각(ISO 8601)
   */
  fetchedAt: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  attractions: number;
  /**
   * 행사 기간 모든 관광지 집중률 평균
   */
  eventMean: number | null;
  /**
   * 예측 30일 전체 평균
   */
  windowMean: number | null;
  /**
   * @maxItems 31
   */
  days: {
    date: string;
    mean: number;
    max: number;
  }[];
  /**
   * @maxItems 5
   */
  top:
    | []
    | [
        {
          name: string;
          rate: number;
        }
      ]
    | [
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        }
      ]
    | [
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        }
      ]
    | [
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        }
      ]
    | [
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        },
        {
          name: string;
          rate: number;
        }
      ];
  datasetId: "ds-kto-concentration-15128555";
}
