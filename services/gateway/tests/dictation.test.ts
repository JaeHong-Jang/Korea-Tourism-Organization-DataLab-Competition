// 가짜 LLM으로 스키마 강제·원문 검증·정규화·폼 대체를 회귀 검증한다
import { describe, expect, it, vi } from "vitest";
import { FAKE_EVENT_TEXT, FAKE_EXTRACTION } from "../src/llm/fake-llm.js";
import { createLlmClient } from "../src/llm/ollama-client.js";
import {
  DICTATION_PROMPT,
  extractEvent,
} from "../src/team/analysis/dictation.js";
import { validateDraft } from "../src/team/analysis/normalize/extraction.js";

const env = { LLM_MODE: "fake", CROWDCAST_TODAY: "2026-09-24" };

// 실제 클라이언트의 fake 분기를 통해 녹화 본문을 반환한다
function recorded(text: string, content: string) {
  return extractEvent(text, {
    env,
    client: createLlmClient({ env, recordings: { [text]: content } }),
  });
}

describe("받아쓰기", () => {
  // 환경 변수 하나로 네트워크 없이 정상 녹화 응답을 재생한다
  it("무료 행사와 예산을 코드로 정규화한다", async () => {
    const result = await extractEvent(FAKE_EVENT_TEXT, { env });
    expect(result.mode).toBe("extracted");
    expect(result.draft).toMatchObject({
      name: "영종도 불꽃축제",
      type: "불꽃",
      startsAt: "2026-10-03T18:00:00+09:00",
      endsAt: "2026-10-03T21:00:00+09:00",
      timeOfDay: "야간",
      sigunguName: "인천 중구",
      sigunguCode: null,
      fee: "무료",
      hostType: "지자체",
      budgetKrw: 200000000,
      missing: [],
    });
    expect(validateDraft(result.draft)).toBe(true);
    expect(result.metrics?.fake).toBe(true);
  });

  // 주최는 missing enum에 없으므로 질문으로만 표현한다
  it("상대 날짜와 빠진 값·주최 질문을 코드가 계산한다", async () => {
    const text =
      "다음 달 둘째 주 토요일 18~21시 중구에서 정동야행 전통 행사를 열어요.";
    const result = await recorded(
      text,
      JSON.stringify({
        ...FAKE_EXTRACTION,
        name: "정동야행",
        typeText: "전통",
        dateText: "다음 달 둘째 주 토요일",
        timeText: "18~21시",
        venueText: "중구",
        feeText: null,
        hostText: null,
        budgetText: null,
      }),
    );
    expect(result.draft.startsAt).toBe("2026-10-10T18:00:00+09:00");
    expect(result.draft.missing).toEqual(["venue", "fee", "budgetKrw"]);
    expect(result.draft.ambiguities[0].candidates).toHaveLength(6);
    expect(result.questions.map((item) => item.field)).toContain("hostType");
  });

  // 추가 필드·누락 필드·enum 이탈·잘못된 JSON을 버리고 완전한 빈 폼을 반환한다
  it.each([
    JSON.stringify({ ...FAKE_EXTRACTION, missing: [] }),
    JSON.stringify({ ...FAKE_EXTRACTION, name: undefined }),
    JSON.stringify({ ...FAKE_EXTRACTION, hazards: ["홍수"] }),
    JSON.stringify({ ...FAKE_EXTRACTION, promo: "현수막" }),
    "```json\n{}\n```",
    "{",
    "null",
  ])("스키마 밖 응답을 거부한다", async (raw) => {
    const result = await recorded(FAKE_EVENT_TEXT, raw);
    expect(result.mode).toBe("form");
    expect(result.reason).toBe("schema");
    expect(result.draft.name).toBeNull();
    expect(result.draft.missing).toHaveLength(7);
    expect(validateDraft(result.draft)).toBe(true);
  });

  // 형식상 정상이어도 원문에 없는 사실을 행사 카드로 사용하지 않는다
  it.each([
    { name: "부산불꽃축제" },
    { dateText: "2027년 10월 3일" },
    { hazards: ["가연성가스"] },
  ])("원문에 없는 값을 거부한다", async (change) => {
    const result = await recorded(
      FAKE_EVENT_TEXT,
      JSON.stringify({ ...FAKE_EXTRACTION, ...change }),
    );
    expect(result.reason).toBe("ungrounded");
  });

  // unknown fake 입력과 실제 전송 장애는 모두 동일한 폼 대체를 사용한다
  it("연결 실패와 녹화 없음에도 폼을 돌려준다", async () => {
    expect((await extractEvent("서울장미축제", { env })).mode).toBe("form");
    const complete = vi.fn().mockRejectedValue(new Error("연결 실패"));
    expect(
      (await extractEvent(FAKE_EVENT_TEXT, { env, client: { complete } }))
        .reason,
    ).toBe("llm");
  });

  // 시스템 프롬프트 캐시에는 오늘 날짜를 넣지 않는다
  it("기준일은 사용자 메시지에만 넘긴다", async () => {
    const client = createLlmClient({ env });
    const complete = vi.spyOn(client, "complete");
    await extractEvent(FAKE_EVENT_TEXT, { env, client });
    const input = complete.mock.calls[0][0];
    expect(input.messages[0]).toEqual({
      role: "system",
      content: DICTATION_PROMPT,
    });
    expect(input.messages[0].content).not.toContain("2026-09-24");
    expect(JSON.parse(input.messages[1].content)).toEqual({
      today: "2026-09-24",
      eventText: FAKE_EVENT_TEXT,
    });
    expect(input.schema).toMatchObject({ additionalProperties: false });
    expect(input.schema.required).not.toContain("missing");
  });
});
