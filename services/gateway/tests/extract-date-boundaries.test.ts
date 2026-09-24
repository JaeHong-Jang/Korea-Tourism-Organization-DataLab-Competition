// 연·월·요일 경계와 미해석 상대 날짜의 되묻기를 회귀 검증한다
import { describe, expect, it } from "vitest";
import { FAKE_EXTRACTION } from "../src/llm/fake-llm.js";
import { createLlmClient } from "../src/llm/ollama-client.js";
import { extractEvent } from "../src/team/analysis/dictation.js";
import { normalizeDates } from "../src/team/analysis/normalize/date.js";
import { validateDraft } from "../src/team/analysis/normalize/extraction.js";

describe("상대 날짜 경계", () => {
  // 연·월 지시어는 기준일의 연말·월말과 윤년을 따라 계산한다
  it.each([
    ["2026-12-24", "내년 1월 둘째 주 토요일", "2027-01-09"],
    ["2026-12-24", "올해 1월 둘째 주 토요일", "2026-01-10"],
    ["2026-12-31", "다음 달 첫째 주 토요일", "2027-01-02"],
    ["2026-12-31", "다음 달 1일", "2027-01-01"],
    ["2026-12-31", "내년 1월 1일", "2027-01-01"],
    ["2026-12-31", "올해 12월 31일", "2026-12-31"],
    ["2026-12-31", "이번 달 31일", "2026-12-31"],
    ["2026-12-31", "내일", "2027-01-01"],
    ["2028-01-31", "다음 달 29일", "2028-02-29"],
    ["2027-01-31", "다음 달 29일", null],
    ["2026-01-31", "다음 달 둘째 주 토요일", "2026-02-14"],
    ["2026-01-31", "이번 달 다섯째 주 토요일", "2026-01-31"],
    ["2026-09-26", "이번 주 토요일", "2026-09-26"],
    ["2026-09-26", "다음 주 토요일", "2026-10-03"],
    ["2026-09-27", "이번 주 일요일", "2026-09-27"],
    ["2026-09-27", "다음 주 일요일", "2026-10-04"],
    ["2026-12-31", "다음 주 월요일", "2027-01-04"],
  ])("%s에서 %s를 계산한다", (today, text, date) => {
    expect(normalizeDates(text, today)).toEqual({ start: date, end: date });
  });

  // 부분 일치로 잘못된 연도나 날짜를 채우지 않고 계약에 맞는 되묻기를 반환한다
  it.each([
    "내후년 1월 둘째 주 토요일",
    "다다음 달 둘째 주 토요일",
    "다다음 주 토요일",
    "내년쯤 1월 10일",
    "내년 둘째 주 토요일",
    "내일이나 모레",
    "내년 1월 마지막 주 토요일",
    "다음 달 31일",
    "내일부터 모레까지",
  ])("%s는 날짜를 비워 두고 확인한다", async (dateText) => {
    const fields = { ...FAKE_EXTRACTION, dateText, timeText: "18~21시" };
    const text = Object.values(fields).flat().join(" ");
    const env = { LLM_MODE: "fake", CROWDCAST_TODAY: "2026-01-31" };
    const result = await extractEvent(text, {
      env,
      client: createLlmClient({
        env,
        recordings: { [text]: JSON.stringify(fields) },
      }),
    });
    expect(result.mode).toBe("extracted");
    expect(result.draft.startsAt).toBeNull();
    expect(result.draft.endsAt).toBeNull();
    expect(result.draft.missing).toEqual(["startsAt", "endsAt"]);
    expect(result.draft.ambiguities).toEqual([
      {
        field: "startsAt",
        candidates: [
          { label: "정확한 날짜 직접 입력", value: "manual" },
          { label: "일정 미정", value: "undecided" },
        ],
      },
    ]);
    expect(result.questions.map((item) => item.field)).toContain("startsAt");
    expect(validateDraft(result.draft)).toBe(true);
  });
});
