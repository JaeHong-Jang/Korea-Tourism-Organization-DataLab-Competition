// 상담 사례와 원시 스트림·채점 결과의 평가 전용 형식을 정의한다
import type {
  ForecastCard,
  ForecastReport,
  SseEvent,
} from "@crowdcast/contracts/types";
import type {
  DraftAnswer,
  NearLocation,
} from "../src/team/analysis/draft-answer.js";
import type { ExtractedFields } from "../src/team/analysis/normalize/extraction.js";

export type Scenario = {
  id: string;
  category: "new" | "ask" | "followup" | "out_of_scope" | "recommend";
  tags: string[];
  parent?: string;
  whatifMode?: "new" | "followup";
  offsetDays?: number;
  text: string;
  extraction?: ExtractedFields;
  location?: { code: string; name: string; lat: number; lng: number };
  answer?: DraftAnswer;
  near?: NearLocation;
  expected: { askFields: string[]; published: boolean; intent: string | null };
};

export type TimedEvent = { elapsedMs: number; envelope: SseEvent };
export type ScenarioTurn = {
  message: { text: string; answer?: DraftAnswer; near?: NearLocation };
  events: TimedEvent[];
  elapsedMs: number;
  problems: string[];
};
export type ScenarioSample = {
  id: string;
  sessionId: string | null;
  parentForecastId: string | null;
  priorCard: ForecastCard | null;
  report: ForecastReport | null;
  turns: ScenarioTurn[];
  problems: string[];
};
export type ScenarioScore = {
  id: string;
  category: Scenario["category"];
  expected: Scenario["expected"];
  passed: boolean;
  problems: string[];
  checks: Record<
    | "sequence"
    | "evidence"
    | "numbers"
    | "interval"
    | "ask"
    | "intent"
    | "publication"
    | "execution",
    boolean
  >;
  sequenceProblems: string[];
  evidenceProblems: string[];
  numberProblems: string[];
  intervalProblems: string[];
  claims: number;
  linkedClaims: number;
  matchedNumberClaims: number;
  numericTokens: number;
  percentCount: number;
  actualAskFields: string[];
  actualIntent: string | null;
  llmCalls: number;
  models: string[];
  latency: {
    forecastMs: number | null;
    publishedDoneMs: number | null;
    excludedAsking: boolean;
  };
};
