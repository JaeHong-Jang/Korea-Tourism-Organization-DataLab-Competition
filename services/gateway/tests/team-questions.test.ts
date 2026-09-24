// 필수 질문 묶음·명시적 유형어·시간대 경계를 상담 스트림과 함께 검증한다
import { describe, expect, it } from "vitest";
import { completeDraft } from "../src/team/analysis/draft-answer.js";
import { eventTime } from "../src/team/analysis/event-time.js";
import { explicitType } from "../src/team/analysis/explicit-type.js";
import { emptyDraft } from "../src/team/analysis/normalize/draft.js";
import { shortText, teamFixture, validSequence } from "./team-fixture.js";

describe("필수 행사 질문", () => {
  // 실제 문제 문장의 typeText가 null이어도 원문의 불꽃만 제한적으로 보완한다
  it("영종 문장은 시각·주최·폭죽 세 질문 뒤 답변만으로 분석을 재개한다", async () => {
    const harness = teamFixture();
    const id = await harness.create();
    const initial = await harness.message(id, { text: shortText });
    validSequence(initial);
    const questions = initial
      .filter((event) => event.event === "ask")
      .map((event) => event.data) as ReturnType<
      typeof completeDraft
    >["questions"];
    expect(questions.map((question) => question.field).sort()).toEqual([
      "hazards",
      "hostType",
      "time",
    ]);
    expect(
      questions
        .find((question) => question.field === "hostType")
        ?.options.map((option) => option.value),
    ).toEqual(["지자체", "민간", "대학", "기타"]);
    expect(
      questions.find((question) => question.field === "hazards")?.options,
    ).toEqual([
      { label: "폭죽 써요", value: "폭죽" },
      { label: "해당 없어요", value: "[]" },
    ]);
    expect(
      initial.find((event) => event.event === "event_card")?.data,
    ).toMatchObject({ type: "불꽃", fee: "미상", budgetKrw: null });
    const resumed = await harness.message(id, {
      text: "시각과 주최 확인",
      answer: {
        startsAt: "2026-10-18T19:00:00+09:00",
        endsAt: "2026-10-18T21:00:00+09:00",
        hostType: "지자체",
        hazards: ["폭죽"],
      },
    });
    validSequence(resumed);
    expect(resumed.some((event) => event.event === "ask")).toBe(false);
    expect(resumed.some((event) => event.event === "forecast")).toBe(true);
    expect(
      resumed.find((event) => event.event === "event_card")?.data,
    ).toMatchObject({
      timeOfDay: "야간",
      fee: "미상",
      budgetKrw: null,
      hazards: ["폭죽"],
    });
    expect(
      harness.calls.find((call) => call.url.pathname === "/v1/predict")?.body,
    ).toMatchObject({ hazards: ["폭죽"] });
  });

  // 시간대만 받은 초안에는 임의 시각을 채우지 않고 한 번에 시각을 묻는다
  it("저녁 표현은 야간으로 보존하되 필수 시각 질문은 하나이다", () => {
    const result = completeDraft(
      { ...emptyDraft(), timeOfDay: "야간" },
      undefined,
    );
    expect(result.draft).toMatchObject({
      startsAt: null,
      endsAt: null,
      timeOfDay: "야간",
    });
    expect(
      result.questions.filter(({ field }) => field === "time"),
    ).toHaveLength(1);
    expect(
      result.questions.some(({ field }) =>
        ["timeOfDay", "fee", "budgetKrw"].includes(field),
      ),
    ).toBe(false);
    const unsolicited = completeDraft(
      result.draft,
      {
        fee: "유료",
        budgetKrw: 200000000,
      },
      result.questions.map(({ field }) => field),
    );
    expect(unsolicited.draft).toMatchObject({ fee: "미상", budgetKrw: null });
    expect(unsolicited.ignoredFields).toEqual(["fee", "budgetKrw"]);
  });
});

// 불꽃·꽃의 부분 문자열과 서로 다른 명시 유형을 구분한다
it.each([
  ["불꽃축제", "불꽃"],
  ["꽃 축제", "꽃"],
  ["공연 행사", "공연"],
  ["대학 축제", "대학"],
  ["먹거리 축제", "먹거리"],
  ["전통 축제", "전통"],
  ["불꽃과 공연", null],
  ["꽃과 불꽃", null],
  ["지역 축제", null],
])("원문 %s의 단일 유형은 %s이다", (text, expected) => {
  expect(explicitType(text)).toBe(expected);
});

// 17시·12시·18시 경계와 오프셋 변환을 고정한다
it.each([
  ["16:59:00", "21:00:00", "주간"],
  ["17:00:00", "21:00:00", "야간"],
  ["11:59:00", "18:01:00", "종일"],
  ["12:00:00", "19:00:00", "주간"],
  ["09:00:00", "18:00:00", "주간"],
  ["09:00:00", "18:00:01", "종일"],
  ["05:00:00", "10:00:00", "주간"],
])("%s~%s 시간대는 %s이다", (start, end, expected) => {
  expect(
    eventTime(`2026-10-18T${start}+09:00`, `2026-10-18T${end}+09:00`),
  ).toBe(expected);
});

// ISO 오프셋이 달라도 국내 개최 시각으로 판단한다
it("UTC 08시는 한국 17시이므로 야간이다", () => {
  expect(eventTime("2026-10-18T08:00:00Z", "2026-10-18T12:00:00Z")).toBe(
    "야간",
  );
});

// 종료 날짜가 넘어가면 새벽 시각도 시작일의 18시 뒤로 판단한다
it.each([
  ["2026-10-18T10:00:00+09:00", "2026-10-19T01:00:00+09:00", "종일"],
  ["2026-10-18T19:00:00+09:00", "2026-10-19T02:00:00+09:00", "야간"],
  ["2026-12-31T10:00:00+09:00", "2027-01-01T01:00:00+09:00", "종일"],
  ["2026-10-18T01:00:00Z", "2026-10-18T16:00:00Z", "종일"],
  ["2026-10-18T01:00:00Z", "2026-10-20T16:00:00Z", "종일"],
])("날짜를 포함한 %s~%s 시간대는 %s이다", (start, end, expected) => {
  expect(eventTime(start, end)).toBe(expected);
});
