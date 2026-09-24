/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 게이트 A 통과 직후 화면에 보내는 것 — 숫자·판정 배너만. 근거·요인 문장은 담지 않는다
 */
export interface ForecastCard {
  id: string;
  eventId: string;
  asOf: string;
  modelVersion: string;
  /**
   * 일평균 방문객 예측(데이터랩 정의, 정답과 같은 단위)
   */
  dailyMean: Quantity & {
    unit?: "명/일";
    timeUnit?: "일";
    estimated?: false;
    valueKind?: "예측";
    p10?: number;
    p50?: number;
    p90?: number;
  };
  /**
   * 순간 최대(가정 2개 — 피크일 계수·동시체류율 — 로 환산한 추정)
   */
  peakConcurrent: Quantity & {
    unit?: "명";
    timeUnit?: "순간";
    estimated?: true;
    valueKind?: "예측";
    /**
     * @minItems 2
     */
    assumptionIds?: [unknown, unknown, ...unknown[]];
    p10?: number;
    p50?: number;
    p90?: number;
  };
  /**
   * @minItems 1
   */
  probabilities: [
    {
      threshold: number;
      probability: number;
      display: string;
    },
    ...{
      threshold: number;
      probability: number;
      display: string;
    }[]
  ];
  peakHours: {
    from: string;
    to: string;
  } | null;
  judgment: {
    /**
     * 1 소규모 · 2 수립 권고 · 3 수립 대상 · 4 대규모
     */
    level: number;
    label: "소규모" | "수립 권고" | "수립 대상" | "대규모";
    /**
     * @minItems 1
     */
    reasons: [
      {
        ruleId: string;
        kind: "법정" | "자체";
        text: string;
      },
      ...{
        ruleId: string;
        kind: "법정" | "자체";
        text: string;
      }[]
    ];
  };
  ood: boolean;
  oodReasons: string[];
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
