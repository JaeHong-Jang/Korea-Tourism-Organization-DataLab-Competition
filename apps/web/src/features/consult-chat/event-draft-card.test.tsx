// 확정된 빈 위험 배열과 날짜 표시를 행사 카드에서 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EventDraft, SseEvent } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EventDraftCard, formatDraftDate } from "./event-draft-card";

// 빈 위험요소는 질문 대기 때만 미확정이고 완료 후에는 해당 없음이다.
it("확정된 빈 위험요소와 한국어 시각을 보인다", () => {
  const events = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "../../packages/contracts/fixtures-sse/valid-new-forecast.json",
      ),
      "utf8",
    ),
  ) as SseEvent[];
  const draft = {
    ...(events.find((event) => event.event === "event_card")
      ?.data as EventDraft),
    hazards: [],
  };
  const complete = renderToStaticMarkup(
    <EventDraftCard draft={draft} pendingFields={[]} />,
  );
  const waiting = renderToStaticMarkup(
    <EventDraftCard draft={draft} pendingFields={["hazards"]} />,
  );
  expect(complete).toContain("해당 없음");
  expect(complete).toContain("10월 18일(토) 19:00");
  expect(complete).not.toContain("2025-10-18T19:00:00+09:00");
  expect(waiting).toContain("확인 필요");
  expect(formatDraftDate("2025-10-18")).toBe("10월 18일(토)");
  expect(formatDraftDate("2025-10-18T19:00:00.000+09:00")).toBe(
    "10월 18일(토) 19:00",
  );
  expect(formatDraftDate("2025-10-18T10:00:00.000Z")).toBe(
    "10월 18일(토) 19:00",
  );
  expect(formatDraftDate("2025-10-18T19:00:00.000")).toBe("10월 18일(토)");
});
