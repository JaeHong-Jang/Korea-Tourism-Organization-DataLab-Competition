/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 검증 센터 입력(정답 = 일평균 방문객)
 */
export interface BacktestSummary {
  runId: string;
  modelRunId: string;
  modelVersion: string;
  target: "일평균 방문객";
  /**
   * @minItems 1
   */
  evalYears: [number, ...number[]];
  metrics: {
    /**
     * 일평균 방문객 MdAPE — 백분율(%)
     */
    mdape: number;
    /**
     * 80% 구간 포함률 — 비율(0~1), 화면 표시만 ×100
     */
    coverage80: number;
    coverageN: number;
    judgmentRecall: number | null;
    judgmentPrecision: number | null;
    baselineDeltaPp: number | null;
    comparablePairs: number;
  };
  points: {
    eventId: string;
    name: string;
    year: number;
    tier: "goldA" | "goldB" | "silver";
    actual: number;
    p10: number;
    p50: number;
    p90: number;
  }[];
  golden: {
    eventId: string;
    name: string;
    hostExpected: Quantity | null;
    model: {
      p10: number;
      p50: number;
      p90: number;
      unit: "명" | "명/일" | "%" | "원" | "배" | "비율";
      timeUnit: "순간" | "일" | "기간누적";
    };
    actual: Quantity;
    unitsComparable: boolean;
    verdict: "포함" | "벗어남" | "정성 비교";
  }[];
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
