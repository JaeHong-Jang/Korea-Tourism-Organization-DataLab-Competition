// 고른 행사 예보 요청은 한 번만 꺼내진다 — 개발 모드에서 효과가 두 번 돌아도 메시지가 두 번 가지 않게(9/26 회귀).
// @vitest-environment jsdom
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { useAssistantStore } from "../consult-store";

it("요청된 행사를 꺼내면 바로 비워 두 번째는 없다", () => {
  const festival = {
    eventId: "e-2026-43130-a",
    name: "충주 농산물직거래 한마당",
  } as FestivalSummary;
  useAssistantStore.getState().chooseFestival(festival);
  expect(useAssistantStore.getState().open).toBe(true);
  expect(useAssistantStore.getState().takeRequest()).toBe(festival);
  expect(useAssistantStore.getState().takeRequest()).toBeNull();
});
