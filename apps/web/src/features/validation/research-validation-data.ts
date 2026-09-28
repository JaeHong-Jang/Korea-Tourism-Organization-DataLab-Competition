// 결정적 연구 실행에서 공개할 검증 수치와 적용 범위를 한곳에 고정한다.
export const researchValidation = {
  runId: "silver-expansion-20260928",
  status: "연구 후보 · 발행 예보 미적용",
  target: "시군구 일평균 방문 순증",
  unit: "명/일",
  snapshot: { trained: 1443, calibrated: 361 },
  evaluation: [
    {
      year: 2025,
      period: "연간",
      events: 635,
      windows: 622,
      mae: 12486.3,
      typeMedianMae: 12958.7,
      snrFilteredMae: 18252.9,
      coverage: 0.818,
      meanWidth: 39258,
    },
    {
      year: 2026,
      period: "1~8월",
      events: 358,
      windows: 354,
      mae: 10764.8,
      typeMedianMae: 11302.3,
      snrFilteredMae: 21637.8,
      coverage: 0.853,
      meanWidth: 36057,
    },
  ],
  cautions: [
    {
      label: "큰 순증",
      count: 124,
      mae: 32055,
      bias: -32055,
      coverage: 0.254,
      definition: "2023년 순증 분포 상위 10% 기준인 25,692.5명/일 이상",
    },
    {
      label: "명절",
      count: 23,
      mae: 27852,
      bias: -9011,
      coverage: 0.565,
      definition: "설날·추석과 기간이 겹친 행사",
    },
  ],
  features: [
    "행사 일정·유형·주야·요금·주최·회차",
    "법정공휴일과 주말 구성",
    "예측일에 공개된 시군구 평시 방문·외지인 비중·주말 비율",
  ],
  excludedFeatures: [
    "행사 뒤 실제 방문량",
    "SNR과 실제 순증",
    "발표 시점을 확인할 수 없는 예산·발표 인원",
  ],
  caveat:
    "행사장 방문객, 순간 최대 인원, 1,000명 안전 기준을 맞혔는지는 이 실험으로 검증하지 않았습니다.",
} as const;

export type ResearchValidation = typeof researchValidation;
