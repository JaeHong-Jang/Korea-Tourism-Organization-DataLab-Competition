/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 근거 조각. kind(=그래프 클래스)마다 반드시 채울 필드가 다르다
 */
export type NoName2 = {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  id: string;
  kind: "data" | "model" | "rule" | "case" | "assumption" | "check";
  title: string;
  summary: string;
  quantityIds: string[];
  period: Period | null;
  source: Source | null;
  availableAt: string | null;
  ruleId: string | null;
  clauseId: string | null;
  caseEventId: string | null;
  assumptionId: string | null;
  forecastId: string | null;
  modelVersion: string | null;
  checkResult: {
    checkKind: "evidence" | "number" | "rule" | "uncertainty" | "ood";
    passed: boolean;
    revision: number;
  } | null;
} & {
  id: string;
  kind: "data" | "model" | "rule" | "case" | "assumption" | "check";
  title: string;
  summary: string;
  quantityIds: string[];
  period: Period | null;
  source: Source | null;
  availableAt: string | null;
  ruleId: string | null;
  clauseId: string | null;
  caseEventId: string | null;
  assumptionId: string | null;
  forecastId: string | null;
  modelVersion: string | null;
  checkResult: {
    checkKind: "evidence" | "number" | "rule" | "uncertainty" | "ood";
    passed: boolean;
    revision: number;
  } | null;
};

/**
 * 예측 서비스의 결정적 결과 전체 — 게이트웨이·근거 그래프 내부용. 화면에는 게이트 A 뒤 forecast-card, 발행 뒤 forecast-report로만 나간다
 */
export interface Forecast {
  id: string;
  eventId: string;
  asOf: string;
  createdAt: string;
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
  hourlyProfile: {
    hour: number;
    share: number;
  }[];
  composition: {
    local: number;
    nonlocal: number;
    foreign: number;
    evidenceId: string;
  } | null;
  judgment: NoName;
  factors: NoName1[];
  ood: boolean;
  oodReasons: string[];
  predictionRun: PredictionRun;
  /**
   * @minItems 1
   */
  observations: [Observation, ...Observation[]];
  /**
   * @minItems 2
   */
  assumptions: [Assumption, Assumption, ...Assumption[]];
  /**
   * @minItems 1
   */
  evidence: [NoName2, ...NoName2[]];
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
/**
 * 판정 엔진 결과. ruleIds = 판정에 쓴 규칙(그래프 cc:judgedBy), 사유 문구는 규칙 결과 템플릿
 */
export interface NoName {
  /**
   * 1 소규모 · 2 수립 권고 · 3 수립 대상 · 4 대규모
   */
  level: number;
  label: "소규모" | "수립 권고" | "수립 대상" | "대규모";
  /**
   * @minItems 1
   */
  ruleIds: [string, ...string[]];
  /**
   * @minItems 1
   */
  reasons: [
    {
      [k: string]: unknown;
    },
    ...{
      [k: string]: unknown;
    }[]
  ];
  checklist: {
    id: string;
    text: string;
    ruleId: string;
    /**
     * @minItems 1
     */
    evidenceIds: [string, ...string[]];
  }[];
  /**
   * 판정 결과를 보이는 방식. 없으면 확률. 등급·사유는 두 방식 모두 같은 확률 판정(판정 함수 하나)으로 정해지고, 구간(골드 표본이 부족할 때 — 06 §11 G0)은 표시만 바꾼다: 확률 %를 쓰지 않고 순간 최대 p10~p90과 '표본 한계로 구간 기준 표시'를 보인다
   */
  basis?: "확률" | "구간";
}
/**
 * SHAP 기여. label은 템플릿 문장(숫자 없음) — 발행 뒤에만 화면에 나간다
 */
export interface NoName1 {
  id: string;
  feature: string;
  direction: "up" | "down";
  contribution: number;
  label: string;
  /**
   * @minItems 1
   */
  evidenceIds: [string, ...string[]];
}
export interface PredictionRun {
  id: string;
  modelRunId: string;
  modelVersion: string;
  asOf: string;
  /**
   * @minItems 1
   */
  observationIds: [string, ...string[]];
  trainRange: Period;
  /**
   * 사용 모델의 검증 상태(reports/backtest/promoted.json의 verdict, 06 §8). 미검증이면 화면·인쇄·docx에 '골든 사례 0건 — 사례 재현 검증 전 임시 사용'
   */
  modelVerdict?: "통과" | "미검증";
}
export interface Period {
  from: string;
  to: string;
}
/**
 * 예측에 쓴 피처 관측값(S09 입력)
 */
export interface Observation {
  id: string;
  featureName: string;
  value: number;
  /**
   * 인원(명·명/일)·비율(%·비율·배)·금액(원)·기간(일 — 예: 반영한 임시공휴일 일수)
   */
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율" | "일";
  datasetId: string;
  observedAt: string;
  availableAt: string;
  /**
   * 2025년 시군구 코드(방문자 API와 같다). IRI = http://crowdcast.local/id/<코드>
   */
  sigunguCode: string;
}
/**
 * 환산 가정(값과 범위)
 */
export interface Assumption {
  id: string;
  name: string;
  value: number;
  low: number;
  high: number;
  /**
   * 인원(명·명/일)·비율(%·비율·배)·금액(원)·기간(일 — 예: 반영한 임시공휴일 일수)
   */
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율" | "일";
  basis: "가정" | "매뉴얼" | "추정";
  note: string;
}
export interface Source {
  datasetId: string;
  title: string;
  publisher: string;
  datalabMenu: string | null;
  accessUrl: string | null;
}
