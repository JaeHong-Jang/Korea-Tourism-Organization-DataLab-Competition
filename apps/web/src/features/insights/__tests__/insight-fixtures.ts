// 실제 계약 모양으로 지표별 표본과 서로 다른 행사 두 건을 구성한다.
import type { FestivalSummary, Insight } from "@crowdcast/contracts/types";
import evidence from "../../../../../../packages/contracts/fixtures/evidence/valid-data.json";
import festival from "../../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";

export const festivals: FestivalSummary[] = [
  {
    ...festival,
    eventId: "ev-yeongjong",
    forecastId: "f-yeongjong",
    name: "영종 씨사이드파크 불꽃축제",
    startsAt: "2026-10-01T09:00:00+09:00",
    endsAt: "2026-10-01T22:00:00+09:00",
    level: 3,
  },
  {
    ...festival,
    eventId: "ev-gangnam",
    forecastId: "f-gangnam",
    name: "강남페스티벌",
    startsAt: "2026-10-02T09:00:00+09:00",
    endsAt: "2026-10-03T22:00:00+09:00",
    level: 4,
  },
] as FestivalSummary[];

// 두 모델 표본과 한 전년 규모 표본은 서로 다른 분모를 사용한다.
export function insight(overrides: Partial<Insight> = {}): Insight {
  return {
    key: "I2",
    title: "1,000명 경계선 행사 비중",
    headline: {
      value: 0,
      unit: "비율",
      text: "전년 규모 대용치이며 올해 사전 예상치가 아닙니다. 추정 산식 기반",
    },
    sampleSize: 2,
    comparablePairs: 1,
    period: { from: "2026-10-01", to: "2026-10-03" },
    computedAt: "2026-09-25T15:40:59+09:00",
    series: [
      ...[0, 0, 1, 1].map((value, index) => ({
        label: `모델 예보 · ${index + 1}등급`,
        value,
      })),
      ...[1, 0, 0, 0].map((value, index) => ({
        label: `주최측 발표 환산(전년 규모 대용) · ${index + 1}등급`,
        value,
      })),
    ],
    evidenceIds: [evidence.id],
    evidence: [
      {
        ...evidence,
        summary: JSON.stringify({
          forecastIds: festivals.map((row) => row.forecastId),
        }),
      },
    ],
    ...overrides,
  } as Insight;
}
