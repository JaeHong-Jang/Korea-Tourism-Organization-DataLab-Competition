// silver-v2-20260928 실행 산출물에서 생성한 화면용 수치다. 손으로 고치지 않는다.
// 재생성: python -m crowdcast.research.silver_v2.web_export --repo . --output apps/web/src/features/validation/research-v2-data.ts
export const researchV2 = {
  runId: "silver-v2-20260928",
  previousRunId: "silver-expansion-20260928",
  ranOn: "2026-09-28",
  status: "연구 모델 · 발행 예보 미적용",
  target: "시군구 일평균 방문 순증",
  unit: "명/일",
  rows: 1804,
  selected: {
    variant: "prior",
    label: "앞선 회차 입력 추가",
    numLeaves: 15,
    minChildSamples: 40,
  },
  snapshot: {
    trained: 1443,
    calibrated: 361,
  },
  priorRows: 656,
  evaluation: [
    {
      year: 2025,
      period: "연간",
      events: 635,
      windows: 622,
      v2: {
        mae: 12360.4,
        pinball: 4181.5,
        coverage: 0.813,
        meanWidth: 38559,
      },
      v1: {
        mae: 12486.3,
        pinball: 4247.4,
        coverage: 0.818,
        meanWidth: 39258,
      },
      typeMedian: {
        mae: 12958.7,
        pinball: 4538.1,
        coverage: 0.812,
        meanWidth: 41415,
      },
      zero: {
        mae: 14206.9,
        pinball: 7103.4,
        coverage: 0.802,
        meanWidth: 45092,
      },
    },
    {
      year: 2026,
      period: "1~8월",
      events: 358,
      windows: 354,
      v2: {
        mae: 9822.8,
        pinball: 3199.3,
        coverage: 0.822,
        meanWidth: 34882,
      },
      v1: {
        mae: 10764.8,
        pinball: 3354.3,
        coverage: 0.853,
        meanWidth: 36057,
      },
      typeMedian: {
        mae: 11302.3,
        pinball: 3864.1,
        coverage: 0.794,
        meanWidth: 36948,
      },
      zero: {
        mae: 13012.1,
        pinball: 6506.1,
        coverage: 0.808,
        meanWidth: 41121,
      },
    },
  ],
  baselines: {
    columns: [2024, 2025, 2026],
    rows: [
      {
        label: "순증 0 기준선",
        values: [12769.1, 14206.9, 13012.1],
        ours: false,
      },
      {
        label: "유형별 중앙값",
        values: [11208.4, 12958.7, 11302.3],
        ours: false,
      },
      {
        label: "SNR>3 학습 대조군 (v1 실행)",
        values: [13919.3, 18252.9, 21637.8],
        ours: false,
      },
      {
        label: "v1 · 전체 자료 월별 재학습",
        values: [11272.3, 12486.3, 10764.8],
        ours: false,
      },
      {
        label: "v2 · 앞선 회차 입력 추가",
        values: [11319.1, 12360.4, 9822.8],
        ours: true,
      },
    ],
  },
  comparisons: [
    {
      year: 2025,
      against: "v1",
      difference: -125.9,
      interval: [-423, 192],
      rows: 635,
      regions: 193,
    },
    {
      year: 2025,
      against: "유형별 중앙값",
      difference: -598.3,
      interval: [-1028, -179],
      rows: 635,
      regions: 193,
    },
    {
      year: 2025,
      against: "순증 0",
      difference: -1846.4,
      interval: [-2461, -1239],
      rows: 635,
      regions: 193,
    },
    {
      year: 2026,
      against: "v1",
      difference: -942.0,
      interval: [-1609, -265],
      rows: 358,
      regions: 170,
    },
    {
      year: 2026,
      against: "유형별 중앙값",
      difference: -1479.5,
      interval: [-2172, -785],
      rows: 358,
      regions: 170,
    },
    {
      year: 2026,
      against: "순증 0",
      difference: -3189.3,
      interval: [-4165, -2234],
      rows: 358,
      regions: 170,
    },
  ],
  split: {
    annual: [
      {
        year: 2024,
        firstTrain: 294,
        firstCalibration: 78,
        lastTrain: 584,
        evaluation: 439,
        firstCutoff: "2023-12-18",
      },
      {
        year: 2025,
        firstTrain: 624,
        firstCalibration: 162,
        lastTrain: 1041,
        evaluation: 635,
        firstCutoff: "2024-12-18",
      },
      {
        year: 2026,
        firstTrain: 1135,
        firstCalibration: 282,
        lastTrain: 1355,
        evaluation: 358,
        firstCutoff: "2025-12-18",
      },
    ],
  },
  checks: [
    {
      label: "입력 자료 해시 실행 전후 동일",
      value: "일치",
    },
    {
      label: "미래 관측 사용 위반",
      value: "5,373건 검사 중 0건",
    },
    {
      label: "앞선 회차 공개일 위반",
      value: "656행 중 0건",
    },
    {
      label: "평가행 집합 (v2·v1·기준선)",
      value: "동일",
    },
    {
      label: "저장한 모델 다시 읽어 예측 재현",
      value: "동일",
    },
    {
      label: "연구 단위 테스트",
      value: "9개 통과",
    },
  ],
  versions: {
    python: "3.12.14",
    lightgbm: "4.6.0",
    numpy: "2.5.3",
    polars: "1.44.2",
    sklearn: "1.9.1",
  },
} as const;

export type ResearchV2 = typeof researchV2;
