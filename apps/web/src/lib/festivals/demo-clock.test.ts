// 데모 URL의 at 값(더하기가 공백으로 바뀐 것 포함)으로 오늘 날짜를 계산해도 화면이 죽지 않아야 한다.
import { describe, expect, it } from "vitest";
import { festivalsClock, hasReadableDates } from "./use-upcoming-festivals";

describe("행사 목록 기준 시각", () => {
  // URLSearchParams가 "+09:00"을 " 09:00"으로 바꿔도 같은 날짜가 나온다.
  it("데모 at 값의 시간대를 복원한다", () => {
    expect(festivalsClock("?at=2026-10-18T19:00+09:00")).toBe("2026-10-18");
  });

  // 읽을 수 없는 at 값은 무시하고 현재 시각을 쓴다(예외를 던지지 않는다).
  it("잘못된 at 값은 현재 시각으로 대신한다", () => {
    expect(festivalsClock("?at=not-a-date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("행사 시각 읽기", () => {
  // 계약 형식을 통과해도 브라우저가 못 읽는 윤초 시각은 받지 않는다(필터·주간 집계의 RangeError 방지).
  it("윤초 시각은 읽을 수 없는 날짜로 본다", () => {
    const base = {
      startsAt: "2026-10-18T19:00:00+09:00",
      endsAt: "2026-10-18T21:00:00+09:00",
    };
    expect(hasReadableDates(base as never)).toBe(true);
    expect(
      hasReadableDates({ ...base, startsAt: "2016-12-31T23:59:60Z" } as never),
    ).toBe(false);
  });
});
