// 세션별 행사 초안과 작업 기록을 보관하고 같은 세션의 동시 실행을 막는다
import { randomUUID } from "node:crypto";
import type {
  AgentStep,
  Claim,
  Event,
  EventDraft,
  ForecastReport,
} from "@crowdcast/contracts/types";
import type { WhatifKind } from "../whatif/intent.js";

export type TeamSession = {
  id: string;
  steps: AgentStep[];
  draft?: EventDraft;
  askedFields: string[];
  hazardCandidates: EventDraft["hazards"];
  hazardsConfirmed: boolean;
  busy: boolean;
  analyzed: boolean;
  completed: boolean;
  forecastId?: string;
  previousForecastIds?: string[];
  storedEvent?: Event;
  pendingWhatif?: { kind?: WhatifKind; forecastId: string };
  published?: {
    report: ForecastReport;
    revision: number;
    masterVersion: number;
    pendingClaims?: Claim[];
    planId?: string;
  };
};

// 저장소 인스턴스는 앱마다 분리해 테스트와 다른 앱의 세션이 섞이지 않게 한다
export function createSessionStore() {
  const sessions = new Map<string, TeamSession>();
  return {
    // 경로에 안전한 시각·난수 식별자만 서버에서 만든다
    create() {
      const id = `s-${Date.now()}-${randomUUID()}`;
      const session: TeamSession = {
        id,
        steps: [],
        askedFields: [],
        hazardCandidates: [],
        hazardsConfirmed: false,
        busy: false,
        analyzed: false,
        completed: false,
      };
      sessions.set(id, session);
      return session;
    },
    get: (id: string) => sessions.get(id),
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
