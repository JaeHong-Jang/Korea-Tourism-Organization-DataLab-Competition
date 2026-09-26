// 방문객 날짜·유형·지역 조건과 원본 수치를 보존하는 정렬을 검증한다
import { describe, expect, it } from "vitest";
import { rulePurpose } from "../src/team/lead/purpose.js";
import {
  recommendationConditions,
  selectRecommendations,
} from "../src/team/recommend/conditions.js";
import { recommendationDates } from "../src/team/recommend/dates.js";
import { festival } from "./proxy-fixture.js";

// KST의 월말·연말·음력 연휴를 포함해 열 가지 이상의 날짜 표현을 고정한다
it.each([
  ["오늘", "2026-09-25", "2026-09-25"],
  ["내일", "2026-09-26", "2026-09-26"],
  ["모레", "2026-09-27", "2026-09-27"],
  ["이번 주말", "2026-09-26", "2026-09-27"],
  ["다음 주말", "2026-10-03", "2026-10-04"],
  ["다음 주", "2026-09-28", "2026-10-04"],
  ["이번 주", "2026-09-25", "2026-09-27"],
  ["다음 주 수요일", "2026-09-30", "2026-09-30"],
  ["이번 달", "2026-09-25", "2026-09-30"],
  ["다음 달", "2026-10-01", "2026-10-31"],
  ["10월", "2026-10-01", "2026-10-31"],
  ["10월 3일", "2026-10-03", "2026-10-03"],
  ["10월 3일부터 5일까지", "2026-10-03", "2026-10-05"],
  ["2026-10-03", "2026-10-03", "2026-10-03"],
  ["추석", "2026-09-24", "2026-09-26"],
  ["행사 추천", "2026-09-25", "2026-10-25"],
])("%s 검색 범위는 %s~%s", (text, from, to) => {
  expect(recommendationDates(text, "2026-09-25")).toEqual({ from, to });
});

// 주최 의사가 명시된 문장은 방문객 키워드가 함께 있어도 주최자로 분류한다
it.each([
  ["불꽃놀이 행사에 가고 싶어", "recommend"],
  ["이번 주말 서울 축제", "recommend"],
  ["갈 만한 공연 추천", "recommend"],
  ["구경하러 놀러 갈 곳 어디야", "recommend"],
  ["데이트할 축제", "recommend"],
  ["이번 주말 축제를 열어요", "new"],
  ["공연 개최 준비 중이에요", "new"],
  ["10월 3일 서울에서 축제를 해요", "new"],
  ["영종 불꽃축제", "unclear"],
])("목적 분류: %s", (text, expected) =>
  expect(rulePurpose(text)).toBe(expected),
);

const festivals = [
  {
    ...festival,
    eventId: "e-seoul-fireworks",
    name: "서울세계불꽃축제",
    type: "불꽃" as const,
    sigunguCode: "11560",
    sigunguName: "서울 영등포구",
    startsAt: "2026-10-03T18:00:00+09:00",
    peakP50: 10000,
  },
  {
    ...festival,
    eventId: "e-busan-fireworks",
    name: "부산불꽃축제",
    type: "불꽃" as const,
    sigunguCode: "26500",
    sigunguName: "부산 수영구",
    startsAt: "2026-10-01T18:00:00+09:00",
    peakP50: 20000,
  },
  {
    ...festival,
    eventId: "e-jinju-lantern",
    name: "진주남강유등축제",
    type: "전통" as const,
    sigunguCode: "48170",
    sigunguName: "경남 진주시",
    startsAt: "2026-10-02T18:00:00+09:00",
    peakP50: 5000,
  },
];

describe("추천 조건", () => {
  // 시군구만 지정해도 코드로 고르고 불꽃은 꽃과 구분한다
  it.each([
    ["10월 서울 불꽃 추천", "e-seoul-fireworks", "서울"],
    ["영등포구에서 불꽃 구경", "e-seoul-fireworks", "서울"],
    ["수영구 놀러 가고 싶어", "e-busan-fireworks", "부산"],
    ["경상남도 진주 전통 축제 추천", "e-jinju-lantern", "경남"],
  ])("%s", (text, id, sido) => {
    const conditions = recommendationConditions(text, "2026-09-25", festivals);
    expect(conditions.query.sido).toBe(sido);
    expect(
      selectRecommendations(festivals, conditions).map(
        (item) => item.summary.eventId,
      ),
    ).toEqual([id]);
  });

  // 여섯 유형 모두 계약 enum으로 추출한다
  it.each(["불꽃", "공연", "꽃", "먹거리", "전통", "대학"])(
    "%s 유형",
    (type) => {
      expect(
        recommendationConditions(`${type} 축제 추천`, "2026-09-25", festivals)
          .query.type,
      ).toBe(type);
    },
  );

  // 인원과 확률 등 카드 필드는 참조 자체를 보존한다
  it.each([
    [
      "축제 추천",
      ["e-busan-fireworks", "e-jinju-lantern", "e-seoul-fireworks"],
    ],
    [
      "한적한 축제 추천",
      ["e-jinju-lantern", "e-seoul-fireworks", "e-busan-fireworks"],
    ],
    [
      "큰 유명한 축제 추천",
      ["e-busan-fireworks", "e-seoul-fireworks", "e-jinju-lantern"],
    ],
  ])("정렬: %s", (text, ids) => {
    const items = selectRecommendations(
      [...festivals].reverse(),
      recommendationConditions(text, "2026-09-25", festivals),
    );
    expect(items.map((item) => item.summary.eventId)).toEqual(ids);
    for (const item of items)
      expect(item.summary).toBe(
        festivals.find((row) => row.eventId === item.summary.eventId),
      );
  });

  // UTC 표현도 실제 한국 날짜를 사용하고 일요일 검색은 지난 토요일로 돌아가지 않는다
  it("KST·연말 경계를 지킨다", () => {
    const item = { ...festivals[0], startsAt: "2026-09-25T15:00:00Z" };
    expect(
      selectRecommendations(
        [item],
        recommendationConditions("내일", "2026-09-25", [item]),
      ),
    ).toHaveLength(1);
    expect(recommendationDates("이번 주말", "2026-09-27")).toEqual({
      from: "2026-09-27",
      to: "2026-09-27",
    });
    expect(recommendationDates("다음 달", "2026-12-25")).toEqual({
      from: "2027-01-01",
      to: "2027-01-31",
    });
  });
});

// 상위 지역이 있으면 동명 시군구를 다른 광역시로 바꾸지 않는다
it("경기도 광주와 광주광역시를 구분한다", () => {
  const rows = [
    {
      ...festivals[0],
      eventId: "e-gwangju-gg",
      sigunguCode: "41610",
      sigunguName: "경기 광주시",
    },
    {
      ...festivals[0],
      eventId: "e-gwangju-city",
      sigunguCode: "29110",
      sigunguName: "광주 동구",
    },
  ];
  const conditions = recommendationConditions(
    "경기도 광주 불꽃 추천",
    "2026-09-25",
    rows,
  );
  expect(conditions.query.sido).toBe("경기");
  expect(
    selectRecommendations(rows, conditions).map((item) => item.summary.eventId),
  ).toEqual(["e-gwangju-gg"]);
});
