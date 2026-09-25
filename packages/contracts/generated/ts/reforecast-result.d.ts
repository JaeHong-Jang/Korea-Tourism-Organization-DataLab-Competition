/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * M5-F3(T-409): 저장한 행사를 상담 없이 다시 예보·검증·발행한 결과와 직전 발행 스냅샷과의 비교. 숫자는 두 스냅샷의 forecast 값 그대로(재계산 없음). 새 스냅샷 전체는 GET /api/forecasts/{forecastId}
 */
export interface ReforecastResult {
  eventId: string;
  forecastId: string;
  /**
   * 직전 발행 스냅샷(없으면 null — 첫 예보)
   */
  previousForecastId: string | null;
  publishedAt: string;
  level: {
    before: number | null;
    /**
     * 1 소규모 · 2 수립 권고 · 3 수립 대상 · 4 대규모
     */
    after: number;
  };
  peakConcurrent: {
    before: {
      p10: number;
      p50: number;
      p90: number;
    } | null;
    after: {
      p10: number;
      p50: number;
      p90: number;
    };
    unit: "명";
  };
  dailyMean: {
    before: {
      p10: number;
      p50: number;
      p90: number;
    } | null;
    after: {
      p10: number;
      p50: number;
      p90: number;
    };
    unit: "명/일";
  };
  /**
   * D-7 날씨 보정(T-208) 적용 여부. 적용하지 않았으면 이유를 note에(예: 행사일이 예보 범위 밖·보정 표본 부족)
   */
  weather: {
    applied: boolean;
    evidenceIds: string[];
    note: string;
  };
}
