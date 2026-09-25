// 행사 고르기 목록이 가까운 날짜 순·끝난 행사 제외·검색 좁히기를 지키는지 확인한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { expect, test } from "vitest";
import { dDayLabel, soonestFestivals } from "./soonest-festivals";

// 이름·지역·시각만 다른 최소 요약을 만든다.
function festival(
  id: string,
  name: string,
  startsAt: string,
  endsAt: string,
  sigunguName = "수원시",
) {
  return {
    eventId: id,
    name,
    sigunguName,
    startsAt,
    endsAt,
    level: 3,
  } as FestivalSummary;
}

const now = new Date("2026-09-25T12:00:00+09:00");
const items = [
  festival(
    "c",
    "가을 음악회",
    "2026-10-10T18:00:00+09:00",
    "2026-10-10T21:00:00+09:00",
  ),
  festival(
    "a",
    "끝난 축제",
    "2026-09-20T10:00:00+09:00",
    "2026-09-21T18:00:00+09:00",
  ),
  festival(
    "b",
    "진천 생거축제",
    "2026-09-27T10:00:00+09:00",
    "2026-09-28T18:00:00+09:00",
    "진천군",
  ),
  festival(
    "d",
    "오늘 장터",
    "2026-09-25T09:00:00+09:00",
    "2026-09-25T20:00:00+09:00",
  ),
];

// 검색어가 없으면 끝난 행사를 빼고 가까운 날짜부터 준다.
test("입력 없이 곧 열리는 행사를 날짜 순으로 보여 준다", () => {
  expect(
    soonestFestivals(items, "", now, 5).map((item) => item.eventId),
  ).toEqual(["d", "b", "c"]);
  expect(soonestFestivals(items, "", now, 2)).toHaveLength(2);
});

// 검색어는 같은 순서를 유지한 채 이름·지역으로만 좁힌다.
test("이름이나 지역으로 좁힌다", () => {
  expect(
    soonestFestivals(items, "진천", now, 8).map((item) => item.eventId),
  ).toEqual(["b"]);
  expect(
    soonestFestivals(items, "음악", now, 8).map((item) => item.eventId),
  ).toEqual(["c"]);
});

// 남은 날은 한국 날짜 기준으로 읽는다.
test("진행 중·D-n을 붙인다", () => {
  expect(dDayLabel(items[3], now)).toBe("진행 중");
  expect(dDayLabel(items[2], now)).toBe("D-2");
  expect(dDayLabel(items[0], now)).toBe("D-15");
});
