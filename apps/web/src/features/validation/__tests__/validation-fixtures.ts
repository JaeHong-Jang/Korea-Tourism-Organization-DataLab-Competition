// 검증 화면의 공개 백테스트·근거 응답 모양을 테스트에서 공유한다.
import type { BacktestSummary, DatalabUsage } from "@crowdcast/contracts/types";

// 현재 승격된 백테스트의 표본과 한계 필드를 재현한다.
export const backtest: BacktestSummary = {
  runId: "bt-v1-064e60073a7411037212",
  modelRunId: "mr-v1-064e60073a7411037212",
  modelVersion: "v1-064e60073a7411037212",
  target: "일평균 방문객",
  evalYears: [2025],
  metrics: {
    mdape: 49.33759813857037,
    coverage80: 49 / 86,
    coverageN: 86,
    judgmentRecall: 1,
    judgmentPrecision: 1,
    baselineDeltaPp: null,
    comparablePairs: 0,
  },
  points: [
    {
      eventId: "e-2025-26530-356df7c5fd",
      name: "부산국제록페스티벌",
      year: 2025,
      tier: "silver",
      actual: 36888,
      p10: 8468,
      p50: 14500,
      p90: 24293,
      level: 4,
      actualLevel: 4,
    },
  ],
  golden: [],
  disclosure: {
    evaluated: 86,
    covered: 49,
    byTier: { gold: 1, silver: 85 },
    skippedYears: [{ year: 2024, reason: "학습 표본 부족" }],
    unscorable: 34,
    belowThresholdActual: 0,
    baselinePairs: { b0: 86, b1: 1, b2: 0 },
  },
};
// 데이터랩 메뉴와 0건 인용을 함께 검사한다.
export const usage: DatalabUsage = {
  generatedAt: "2026-09-25T12:00:00+09:00",
  publishedClaims: 10,
  claimsWithEvidence: 8,
  claimsReachingDatalab: 3,
  shaclPassRate: null,
  evidenceByDataset: [
    {
      datasetId: "ds-15101972",
      title: "방문자",
      datalabMenu: "방문자 수",
      count: 0,
    },
  ],
};
