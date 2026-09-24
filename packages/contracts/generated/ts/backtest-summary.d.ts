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
    /**
     * 예측 분포의 환산 판정 등급(1~4, 3 이상 = 수립 대상) — 순간 최대 환산은 가정
     */
    level?: number;
    /**
     * 실측 일평균을 같은 환산으로 판정한 등급 — 사분면(예측 × 실측 대상 여부)용, 가정
     */
    actualLevel?: number;
  }[];
  golden: {
    eventId: string;
    name: string;
    hostExpected: Quantity | null;
    model: {
      p10: number;
      p50: number;
      p90: number;
      /**
       * 인원(명·명/일)·비율(%·비율·배)·금액(원)·기간(일 — 예: 반영한 임시공휴일 일수)
       */
      unit: "명" | "명/일" | "%" | "원" | "배" | "비율" | "일";
      timeUnit: "순간" | "일" | "기간누적";
    };
    actual: Quantity;
    unitsComparable: boolean;
    verdict: "포함" | "벗어남" | "정성 비교";
  }[];
  /**
   * 보고서의 핵심 분모·한계(주 모델 평가 표본 기준) — 서식4·S6가 그대로 인용한다
   */
  disclosure?: {
    evaluated: number;
    covered: number;
    byTier: {
      gold: number;
      silver: number;
    };
    skippedYears: {
      year: number;
      reason: string;
    }[];
    /**
     * 명절 실버 등 채점 불가 건수
     */
    unscorable: number;
    /**
     * 실측 판정이 수립 대상 미만인 평가 표본 수 — 0이면 경계 성능을 말할 수 없다
     */
    belowThresholdActual: number;
    baselinePairs: {
      b0: number;
      /**
       * 전회차 골드 실측 쌍
       */
      b1: number;
      b2: number;
    };
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
  /**
   * 인원(명·명/일)·비율(%·비율·배)·금액(원)·기간(일 — 예: 반영한 임시공휴일 일수)
   */
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율" | "일";
  timeUnit: "순간" | "일" | "기간누적";
  spatialScope: "행사장" | "행정동" | "시군구";
  valueKind: "사전예상" | "사후집계" | "예측" | "관측";
  estimated: boolean;
  assumptionIds: string[];
  announcedAt: string | null;
}
