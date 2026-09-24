/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 근거 조각(09 §3). 종류마다 반드시 채울 필드가 다르다
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
  source: Source | null;
  availableAt: string | null;
  ruleId: string | null;
  clauseId: string | null;
  caseEventId: string | null;
  assumptionId: string | null;
  modelVersion: string | null;
  check: {
    kind: "evidence" | "number" | "rule" | "uncertainty" | "ood";
    passed: boolean;
    revision: number;
  } | null;
} & {
  id: string;
  kind: "data" | "model" | "rule" | "case" | "assumption" | "check";
  title: string;
  summary: string;
  quantityIds: string[];
  source: Source | null;
  availableAt: string | null;
  ruleId: string | null;
  clauseId: string | null;
  caseEventId: string | null;
  assumptionId: string | null;
  modelVersion: string | null;
  check: {
    kind: "evidence" | "number" | "rule" | "uncertainty" | "ood";
    passed: boolean;
    revision: number;
  } | null;
};

/**
 * 예측 서비스의 결정적 결과(숫자·판정·요인·계보·근거). 화면 숫자는 이 JSON만 쓴다
 */
export interface Forecast {
  id: string;
  eventId: string;
  asOf: string;
  createdAt: string;
  modelVersion: string;
  dailyMean: Quantity;
  peakConcurrent: Quantity;
  /**
   * @minItems 1
   */
  probabilities: [
    {
      threshold: number;
      probability: number;
      /**
       * 정수 % 또는 표본이 적으면 구간("30~50%")
       */
      display: string;
    },
    ...{
      threshold: number;
      probability: number;
      /**
       * 정수 % 또는 표본이 적으면 구간("30~50%")
       */
      display: string;
    }[]
  ];
  peakHours: {
    from: string;
    to: string;
  } | null;
  /**
   * 유형별 표준 곡선(가정)
   */
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
   * @minItems 1
   */
  evidence: [NoName2, ...NoName2[]];
}
/**
 * 수치 노드(09 §4). 문장의 자리표시자는 이 id와 필드를 가리킨다
 */
export interface Quantity {
  id: string;
  name?: string;
  value?: number | null;
  p10?: number | null;
  p50?: number | null;
  p90?: number | null;
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율";
  timeUnit: "순간" | "일" | "기간누적";
  spatialScope: "행사장" | "행정동" | "시군구";
  kind: "사전예상" | "사후집계" | "예측" | "관측";
  /**
   * 가정이 들어간 환산값이면 true
   */
  estimated: boolean;
  assumptionIds?: string[];
}
/**
 * 판정 엔진(결정적 규칙)의 결과. 판정 문구는 규칙 결과 템플릿에서만 나온다
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
  reasons: [
    {
      ruleId: string;
      kind: "법정" | "자체";
      text: string;
      clauseId: string | null;
      evidenceId: string;
    },
    ...{
      ruleId: string;
      kind: "법정" | "자체";
      text: string;
      clauseId: string | null;
      evidenceId: string;
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
}
/**
 * SHAP 기여를 요인 문장으로 옮긴 것
 */
export interface NoName1 {
  id: string;
  feature: string;
  direction: "up" | "down";
  /**
   * log 규모 기여도
   */
  contribution: number;
  /**
   * 템플릿 문장(숫자 없음)
   */
  label: string;
  /**
   * @minItems 1
   */
  evidenceIds: [string, ...string[]];
}
export interface PredictionRun {
  id: string;
  modelVersion: string;
  asOf: string;
  /**
   * @minItems 1
   */
  observationIds: [string, ...string[]];
  trainRange: Period;
}
export interface Period {
  from: string;
  to: string;
}
/**
 * 예측에 쓴 피처 관측값 하나(누수 검사 S09의 입력)
 */
export interface Observation {
  id: string;
  featureName: string;
  value: number;
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율";
  datasetId: string;
  observedAt: string;
  availableAt: string;
  /**
   * 2025년 시군구 코드 체계(방문자 API와 같은 코드)
   */
  sigunguCode: string;
}
export interface Source {
  datasetId: string;
  title: string;
  publisher: string;
  /**
   * 데이터랩 메뉴 경로(예: 빅데이터 > 지역별 방문자수)
   */
  datalabMenu: string | null;
  accessUrl: string | null;
}
