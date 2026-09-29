// 문체부 개최계획에서 생성한 연도별 축제 총 방문객과 2026 추세 예측이다. 손으로 고치지 않는다.
// 재생성: python -m crowdcast.research.festival_totals --festivals <mcst_festivals.parquet> --output apps/web/src/features/validation/festival-visitors-data.ts
export const festivalVisitors = {
  source:
    "문화체육관광부 지역축제 개최계획(2018~2026년) · 주최 측 발표 전년도 방문객",
  unitFix:
    "2017~2021년 계획서(천명 머리글)에서 1,000만 명 이상 값은 1,000으로 나눔",
  points: [
    {
      year: 2017,
      total: 158097866,
      reported: 793,
      planned: 733,
      covid: false,
    },
    {
      year: 2018,
      total: 193862311,
      reported: 862,
      planned: 886,
      covid: false,
    },
    {
      year: 2019,
      total: 178737914,
      reported: 933,
      planned: 884,
      covid: false,
    },
    {
      year: 2020,
      total: 69928924,
      reported: 514,
      planned: 968,
      covid: true,
    },
    {
      year: 2021,
      total: 10758739,
      reported: 247,
      planned: 1004,
      covid: true,
    },
    {
      year: 2022,
      total: 34671843,
      reported: 340,
      planned: 944,
      covid: true,
    },
    {
      year: 2023,
      total: 118554206,
      reported: 1132,
      planned: 1129,
      covid: false,
    },
    {
      year: 2024,
      total: 131352344,
      reported: 1078,
      planned: 1170,
      covid: false,
    },
    {
      year: 2025,
      total: 164012231,
      reported: 1181,
      planned: 1214,
      covid: false,
    },
  ],
  forecast: {
    year: 2026,
    value: 193255213,
    low: 181717644,
    high: 204792782,
    growth: [0.108, 0.2486],
    method:
      "2023→2024, 2024→2025 성장률의 평균(중앙)과 최소~최대(범위)를 2025년에 적용",
  },
} as const;
