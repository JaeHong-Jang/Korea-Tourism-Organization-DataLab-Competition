/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 근거 조각. kind(=그래프 클래스)마다 반드시 채울 필드가 다르다
 */
export type NoName5 = {
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
 * 설명·판정·권고 문장. 발행 후보·발행이면 근거·검사·렌더 결과가 있어야 한다
 */
export type NoName6 = {
  [k: string]: unknown;
} & {
  id: string;
  sessionId: string;
  forecastId: string;
  text: string;
  rendered: string | null;
  claimType: "판정" | "수치" | "요인" | "권고" | "설명";
  status: "draft" | "candidate" | "published" | "rejected";
  evidenceIds: string[];
  placeholders: {
    name: string;
    quantityId: string;
    field: "value" | "p10" | "p50" | "p90";
  }[];
  generatedBy: {
    agentId:
      | "lead"
      | "dictation"
      | "local-guide"
      | "archivist"
      | "forecaster"
      | "source-check"
      | "number-check"
      | "rule-check"
      | "skeptic"
      | "explainer"
      | "card-maker"
      | "plan-writer"
      | "briefer";
    stepId: string;
  };
  checks: {
    checkKind: "evidence" | "number" | "rule" | "uncertainty";
    passed: boolean;
    revision: number;
  }[];
};

/**
 * 발행 뒤 예보서 전체(S3 새로고침·공유 링크·스냅샷). claims는 모두 published 일관성(rules/integrity.mjs가 검사): card = projectCard(forecast)(rules/card-projection.mjs), evidence = forecast.evidence ∪ similar[].evidence ∪ baseline.evidence(id 기준), claims[]의 sessionId·forecastId = 머리 값, layout[]·brief의 claimIds·evidenceIds는 이 문서 안에 있어야 한다
 */
export interface ForecastReport {
  forecastId: string;
  sessionId: string;
  publishedAt: string;
  revision: number;
  masterVersion: number;
  event: NoName;
  card: NoName1;
  forecast: NoName2;
  /**
   * @minItems 1
   */
  claims: [
    NoName6 & {
      status?: "published";
    },
    ...(NoName6 & {
      status?: "published";
    })[]
  ];
  /**
   * @minItems 1
   */
  evidence: [NoName5, ...NoName5[]];
  similar: NoName7[];
  baseline: NoName8 | null;
  /**
   * @minItems 1
   */
  layout: [
    {
      slot:
        | "judgment"
        | "numbers"
        | "explanation"
        | "similar"
        | "baseline"
        | "composition"
        | "hourly"
        | "checklist"
        | "next";
      claimIds: string[];
      evidenceIds: string[];
    },
    ...{
      slot:
        | "judgment"
        | "numbers"
        | "explanation"
        | "similar"
        | "baseline"
        | "composition"
        | "hourly"
        | "checklist"
        | "next";
      claimIds: string[];
      evidenceIds: string[];
    }[]
  ];
  brief: {
    /**
     * @maxItems 3
     */
    claimIds: [] | [string] | [string, string] | [string, string, string];
    actions: Action[];
  };
}
/**
 * 정규화된 행사
 */
export interface NoName {
  id: string;
  name: string;
  type: "불꽃" | "공연" | "대학" | "먹거리" | "꽃" | "전통" | "기타";
  startsAt: string;
  endsAt: string;
  timeOfDay: "주간" | "야간" | "종일" | "미상";
  venue: {
    name: string;
    lat: number;
    lng: number;
  };
  sido: string;
  /**
   * 2025년 시군구 코드(방문자 API와 같다). IRI = http://crowdcast.local/id/<코드>
   */
  sigunguCode: string;
  sigunguName: string;
  fee: "무료" | "유료" | "미상";
  hostType: "지자체" | "민간" | "대학" | "기타";
  budgetKrw: number | null;
  edition: number | null;
  promo: string[];
  hazards: (
    "폭죽" | "불" | "가연성가스" | "석유류" | "산" | "수면" | "차량진입" | "단일출입구" | "무대밀집" | "야간조명부족"
  )[];
  expectedByHost: Quantity | null;
  source: "사용자입력" | "문체부" | "TourAPI" | "데이터랩";
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
/**
 * 게이트 A 통과 직후 화면에 보내는 것 — 숫자·판정 배너만. 근거·요인 문장은 담지 않는다 forecast의 결정적 투영이다(rules/card-projection.mjs의 projectCard). 따로 계산하지 않는다
 */
export interface NoName1 {
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
 * 예측 서비스의 결정적 결과 전체 — 게이트웨이·근거 그래프 내부용. 화면에는 게이트 A 뒤 forecast-card, 발행 뒤 forecast-report로만 나간다
 */
export interface NoName2 {
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
  judgment: NoName3;
  factors: NoName4[];
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
  evidence: [NoName5, ...NoName5[]];
}
/**
 * 판정 엔진 결과. ruleIds = 판정에 쓴 규칙(그래프 cc:judgedBy), 사유 문구는 규칙 결과 템플릿
 */
export interface NoName3 {
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
}
/**
 * SHAP 기여. label은 템플릿 문장(숫자 없음) — 발행 뒤에만 화면에 나간다
 */
export interface NoName4 {
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
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율";
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
  unit: "명" | "명/일" | "%" | "원" | "배" | "비율";
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
/**
 * 기록관 결과. 단위가 같을 때만 비교한다
 */
export interface NoName7 {
  eventId: string;
  name: string;
  year: number;
  sigunguName: string;
  type: "불꽃" | "공연" | "대학" | "먹거리" | "꽃" | "전통" | "기타";
  measured: Quantity | null;
  announced: Quantity | null;
  unitsComparable: boolean;
  similarity: number;
  evidenceId: string;
  /**
   * @minItems 1
   */
  evidence: [NoName5, ...NoName5[]];
}
/**
 * 행사 전 기간의 요일별 평시 방문
 */
export interface NoName8 {
  /**
   * 2025년 시군구 코드(방문자 API와 같다). IRI = http://crowdcast.local/id/<코드>
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
  /**
   * @minItems 1
   */
  evidence: [NoName5, ...NoName5[]];
}
export interface Action {
  id: string;
  label: string;
}
