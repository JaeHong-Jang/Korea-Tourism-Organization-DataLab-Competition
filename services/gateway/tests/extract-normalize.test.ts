// 월말·윤년·자정과 누락 요금처럼 LLM에 맡기면 달라지는 정규화를 검증한다
import { describe, expect, it, vi } from "vitest";
import { FAKE_EXTRACTION } from "../src/llm/fake-llm.js";
import { normalizeBudget } from "../src/team/analysis/normalize/budget.js";
import {
  normalizeDates,
  todayInKorea,
} from "../src/team/analysis/normalize/date.js";
import { normalizeDraft } from "../src/team/analysis/normalize/draft.js";
import { normalizeEventType } from "../src/team/analysis/normalize/event-type.js";
import { normalizeFee } from "../src/team/analysis/normalize/fee.js";
import { normalizeHost } from "../src/team/analysis/normalize/organizer.js";
import { normalizeTime } from "../src/team/analysis/normalize/time.js";

describe("날짜", () => {
  // 상대 날짜는 고정 기준일로 재현한다
  it.each([
    ["내일", "2026-09-25"],
    ["모레", "2026-09-26"],
    ["다음 주 토요일", "2026-10-03"],
    ["다음 달 둘째 주 토요일", "2026-10-10"],
    ["이번 달 넷째 주 토요일", "2026-09-26"],
    ["10월 3일", "2026-10-03"],
    ["2028년 2월 29일", "2028-02-29"],
    ["2027년 2월 29일", null],
    ["2026년 2월 다섯째 주 토요일", null],
    ["언젠가", null],
  ])("%s를 달력 날짜로 바꾼다", (text, date) => {
    expect(normalizeDates(text, "2026-09-24")).toEqual({
      start: date,
      end: date,
    });
  });

  // 같은 달 생략 범위와 연말 범위는 허용하고 역전·불완전 범위는 보류한다
  it("날짜 범위와 연말 상대 표현을 처리한다", () => {
    expect(normalizeDates("2026년 10월 3일부터 5일까지", "2026-09-24")).toEqual(
      { start: "2026-10-03", end: "2026-10-05" },
    );
    expect(normalizeDates("2026-12-31~2027-01-01", "2026-09-24")).toEqual({
      start: "2026-12-31",
      end: "2027-01-01",
    });
    expect(normalizeDates("다음 달 첫째 주 토요일", "2026-12-24").start).toBe(
      "2027-01-02",
    );
    expect(
      normalizeDates("2026년 10월 5일부터 3일까지", "2026-09-24").start,
    ).toBeNull();
    expect(normalizeDates("내일부터 모레까지", "2026-09-24").start).toBeNull();
  });

  // 실측 모델이 날짜와 시각을 함께 복사한 경우 날짜 범위로 오인하지 않는다
  it("날짜에 중복된 시각 원문을 분리한다", () => {
    expect(
      normalizeDates(
        "2026년 10월 3일 오후 6시부터 오후 9시까지",
        "2026-09-24",
        "오후 6시부터 오후 9시",
      ),
    ).toEqual({ start: "2026-10-03", end: "2026-10-03" });
    expect(
      normalizeDates(
        "내일 10시부터 17시까지",
        "2026-09-24",
        "10시부터 17시까지",
      ).start,
    ).toBe("2026-09-25");
    expect(
      normalizeDates("2026년 13월 둘째 주 토요일", "2026-09-24").start,
    ).toBeNull();
  });

  // UTC 자정 이전에도 한국의 실제 오늘을 쓰고 잘못된 데모 날짜를 거부한다
  it("오늘은 한국 표준시로 계산한다", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-24T16:00:00Z"));
      expect(todayInKorea({})).toBe("2026-09-25");
      expect(() => todayInKorea({ CROWDCAST_TODAY: "2026-02-30" })).toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("시각·요금·유형", () => {
  // 한국어 시각·24시간 표기를 동일한 초 단위 시각으로 바꾼다
  it.each([
    ["오후 6시부터 9시까지", "18:00:00", "21:00:00", "야간"],
    ["오전 10시부터 오후 5시까지", "10:00:00", "17:00:00", "주간"],
    ["18:30~21:00", "18:30:00", "21:00:00", "야간"],
    ["10~21시", "10:00:00", "21:00:00", "종일"],
    ["야간", null, null, "야간"],
    ["오후 25시", null, null, null],
  ])("%s를 정규화한다", (text, start, end, timeOfDay) => {
    expect(normalizeTime(text)).toMatchObject({ start, end, timeOfDay });
  });

  // 야간 자정 경과와 시각 누락을 혼동해 같은 날짜의 잘못된 구간을 만들지 않는다
  it("자정 경과는 다음 날로 계산하고 시각 누락은 되묻는다", () => {
    const overnight = normalizeDraft(
      {
        ...FAKE_EXTRACTION,
        dateText: "2026년 10월 3일",
        timeText: "밤 10시부터 다음날 새벽 2시까지",
      },
      "2026-09-24",
    );
    expect(overnight.endsAt).toBe("2026-10-04T02:00:00+09:00");
    const unknown = normalizeDraft(
      { ...FAKE_EXTRACTION, dateText: "2026년 10월 3일", timeText: "야간" },
      "2026-09-24",
    );
    expect(unknown.startsAt).toBeNull();
    expect(unknown.missing).toEqual(["startsAt", "endsAt"]);
  });

  // 무료 기본값이나 주최자를 임의로 채우지 않는다
  it("요금·주최·예산·유형을 원문에서만 분류한다", () => {
    expect(
      [null, "무료", "0원", "1만 5천원", "입장 무료, 체험 유료", "미정"].map(
        normalizeFee,
      ),
    ).toEqual([null, "무료", "무료", "유료", "유료", "미상"]);
    expect(
      [null, "서울 중구청", "총학생회", "민간 기획사"].map(normalizeHost),
    ).toEqual([null, "지자체", "대학", "민간"]);
    expect(
      ["1억 5000만원", "0원", "미정", "-1억원", "약 2억원"].map(
        normalizeBudget,
      ),
    ).toEqual([150000000, 0, null, null, null]);
    expect(
      [
        "불꽃놀이",
        "대동제",
        "커피 축제",
        "벚꽃",
        "탈춤",
        "재즈",
        "꽃",
        "대학",
        "축제",
      ].map(normalizeEventType),
    ).toEqual([
      "불꽃",
      "대학",
      "먹거리",
      "꽃",
      "전통",
      "공연",
      "꽃",
      "대학",
      null,
    ]);
  });
});
