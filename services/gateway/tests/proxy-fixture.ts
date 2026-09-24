// 조회 테스트에서 실제 한국 행사 계약 픽스처와 가짜 상류 응답을 공유한다
import type {
  BacktestSummary,
  DatalabSpec,
  DatalabUsage,
  FestivalSummary,
  Insight,
  ModelCard,
  OpsStatus,
  Plan,
  PreregistrationScores,
  Weather,
} from "@crowdcast/contracts/types";
import type { ValidateFunction } from "ajv";
import { vi } from "vitest";
import { querySchema } from "../src/clients/query-schemas.js";
import { readConfig } from "../src/config.js";
import { responseSchema } from "../src/contract/responses.js";
import { readContractFixture } from "./contract-fixture.js";

export const proxyConfig = readConfig({
  FORECAST_URL: "http://forecast.test",
  KNOWLEDGE_URL: "http://knowledge.test",
  RECORDS_URL: "http://records.test",
});

// unknown 픽스처는 타입 단언 대신 해당 계약을 통과시켜 사용한다
export function checkedFixture<T>(
  path: string,
  validate: ValidateFunction<T>,
): T {
  const value = readContractFixture(path);
  if (!validate(value)) throw new Error(`픽스처 계약 위반: ${path}`);
  return value;
}

// 기존 계약 픽스처를 그대로 읽어 중복 JSON 파일을 만들지 않는다
export const festival = checkedFixture(
  "festival-summary/valid-card.json",
  querySchema<FestivalSummary>("festival-summary"),
);
export const report = checkedFixture(
  "forecast-report/valid-yeongjong.json",
  responseSchema("forecast-report"),
);
export const evidence = checkedFixture(
  "evidence/valid-data.json",
  responseSchema("evidence"),
);
export const modelCard = checkedFixture(
  "model-card/valid-v0-1-0.json",
  querySchema<ModelCard>("model-card"),
);
export const usage = checkedFixture(
  "datalab-usage/valid-example.json",
  querySchema<DatalabUsage>("datalab-usage"),
);
export const spec = checkedFixture(
  "datalab-spec/valid-example.json",
  querySchema<DatalabSpec>("datalab-spec"),
);
export const ops = checkedFixture(
  "ops-status/valid-example.json",
  querySchema<OpsStatus>("ops-status"),
);

// 아직 계약 픽스처가 없는 응답은 생성 타입에 맞춘 최소 테스트 값으로 구성한다
export const weather: Weather = {
  lat: 37.49,
  lng: 126.58,
  at: "2025-10-18T19:00:00+09:00",
  sky: null,
  pty: null,
  temp: null,
  pop: null,
  source: "없음",
  fetchedAt: null,
};
export const backtest: BacktestSummary = {
  runId: "backtest-2025",
  modelRunId: modelCard.id,
  modelVersion: modelCard.modelVersion,
  target: "일평균 방문객",
  evalYears: [2025],
  metrics: {
    mdape: 12.5,
    coverage80: 0.8,
    coverageN: 10,
    judgmentRecall: null,
    judgmentPrecision: null,
    baselineDeltaPp: null,
    comparablePairs: 10,
  },
  points: [
    {
      eventId: festival.eventId,
      name: festival.name,
      year: 2025,
      tier: "goldA",
      actual: 21000,
      p10: 12000,
      p50: 21000,
      p90: 35000,
    },
  ],
  golden: [],
};
export const preregistration: PreregistrationScores = {
  registeredAt: "2025-10-04T00:00:00+09:00",
  tag: "prereg-2025",
  rulesDoc: "사전 등록 규칙",
  entries: [],
  summary: {
    registered: 0,
    scored: 0,
    inInterval: 0,
    unscorable: 0,
    cancelled: 0,
  },
};
export const insight: Insight = {
  key: "I1",
  title: "영종 방문자 비교",
  headline: { value: 1, unit: "배", text: "동일 기간 비교" },
  sampleSize: 1,
  comparablePairs: 1,
  period: { from: "2025-10-18", to: "2025-10-18" },
  series: [{ label: festival.name, value: 1 }],
  evidenceIds: [evidence.id],
  evidence: [evidence],
  computedAt: "2025-10-19T00:00:00+09:00",
};

// plans 요청은 예보서와 아홉 개 계획 섹션의 생성 타입을 만족한다
const planInput: unknown = {
  id: "plan-yeongjong-example",
  forecastId: report.forecastId,
  eventId: report.event.id,
  sessionId: report.sessionId,
  title: "영종 씨사이드파크 불꽃축제 안전관리계획 초안",
  createdAt: "2025-10-04T00:00:00+09:00",
  updatedAt: "2025-10-04T00:00:00+09:00",
  watermark: "참고용 초안 — 담당자 검토 필수",
  sections: [
    "overview",
    "organization",
    "crowd-timeline",
    "routes-evacuation",
    "staffing",
    "traffic-parking",
    "medical-toilets",
    "weather-emergency",
    "non-crowd-risks",
  ].map((key) => ({
    ...checkedFixture(
      "plan-section/valid-overview.json",
      querySchema<Plan["sections"][number]>("plan-section"),
    ),
    key,
    status: "검토 필요",
    body: "",
    claimIds: [],
    lockedFields: [],
  })),
};

// 배열 길이까지 검사해 생성 타입의 아홉 섹션 튜플로 좁힌다
const validatePlan = querySchema<Plan>("plan");
if (!validatePlan(planInput)) throw new Error("계획 픽스처 계약 위반");
export const plan = planInput;

// 전달 경로가 예상과 다르면 실제 네트워크 대신 테스트를 실패시킨다
export function fakeUpstreams(bodies: Record<string, unknown>) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const key = `${url.host}${url.pathname}`;
    if (!(key in bodies)) throw new Error(`예상하지 않은 가짜 상류: ${key}`);
    return Response.json(bodies[key]);
  });
}
