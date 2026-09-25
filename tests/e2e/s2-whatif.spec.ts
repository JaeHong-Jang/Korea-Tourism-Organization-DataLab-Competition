// 계약 SSE를 재생해 후속 칩부터 새 예보 비교와 예보서 링크까지 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import { expect, type Page, test } from "@playwright/test";

const example =
  "10월 18일 19시부터 21시까지 영종 씨사이드파크에서 인천 중구가 여는 불꽃축제를 해요";
const output = resolve(
  process.cwd(),
  "../../reports/figures/screens/T-309-compare.png",
);
const contract = (name: string): SseEvent[] => {
  const document = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "../../packages/contracts/fixtures-sse",
        `${name}.json`,
      ),
      "utf8",
    ),
  );
  return Array.isArray(document) ? document : document.events;
};
const frames = (events: SseEvent[]) =>
  events
    .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");

// 대화 서랍의 공용 입력칸에서 행사 설명을 보낸다.
async function sendExample(page: Page) {
  await page.getByLabel("행사를 설명해 주세요").fill(example);
  await page.getByRole("button", { name: "보내기" }).click();
}

// 원래 픽스처의 일정을 일요일로 옮기고 계약 카드의 수치와 id를 새 예보로 바꾼다.
function sundayForecast(): SseEvent[] {
  const events = structuredClone(contract("valid-new-forecast"));
  for (const event of events) {
    if (event.event === "event_card") {
      const draft = event.data as Record<string, unknown>;
      draft.startsAt = "2025-10-19T19:00:00+09:00";
      draft.endsAt = "2025-10-19T21:00:00+09:00";
    }
    if (event.event === "forecast") {
      const card = event.data as Record<string, unknown>;
      card.id = "f-yeongjong-sunday-2025";
      (card.peakConcurrent as Record<string, unknown>).p50 = 30_000;
      (card.dailyMean as Record<string, unknown>).p50 = 16_000;
    }
    if (event.event === "claim") {
      const claim = event.data as Record<string, unknown>;
      claim.forecastId = "f-yeongjong-sunday-2025";
      if (typeof claim.rendered === "string")
        claim.rendered = claim.rendered.replace("21000", "30000");
    }
    if (event.event === "done")
      (event.data as Record<string, unknown>).forecastId =
        "f-yeongjong-sunday-2025";
  }
  return events;
}

// 같은 세션에 첫 예보를 발행하고 이후 질문에는 선택한 계약 흐름을 돌려준다.
async function routeSession(page: Page, next: SseEvent[]) {
  const messages: { text: string }[] = [];
  await page.route("**/api/team/sessions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessionId: "s-demo-0001" }),
    }),
  );
  await page.route("**/api/team/sessions/*/messages", (route) => {
    messages.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: frames(
        messages.length === 1 ? contract("valid-new-forecast") : next,
      ),
    });
  });
  return messages;
}

// 칩도 직접 입력처럼 전송하고 두 카드와 발행된 새 예보서 링크를 보여 준다.
test("일요일 what-if 비교", async ({ page }) => {
  const messages = await routeSession(page, sundayForecast());
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/consult?theme=day");
  await sendExample(page);
  await expect(page.getByRole("button", { name: "일요일이면?" })).toBeVisible();
  await page.getByRole("button", { name: "일요일이면?" }).click();
  const comparison = page.getByRole("region", {
    name: "원래 예보와 바뀐 예보 비교",
  });
  await expect(comparison).toBeVisible();
  await expect(
    comparison.getByRole("region", { name: "원래 예보", exact: true }),
  ).toContainText("21,000명");
  await expect(
    comparison.getByRole("region", { name: "바뀐 예보", exact: true }),
  ).toContainText("30,000명");
  await expect(
    comparison.locator(".consult-compare__condition--changed"),
  ).toContainText("19일");
  await expect(
    comparison.getByRole("link", { name: "바뀐 예보서 열기" }),
  ).toHaveAttribute("href", "/f/f-yeongjong-sunday-2025");
  expect(messages[1].text).toBe("일요일이면?");
  await page.screenshot({ path: output, fullPage: true });
});

// 설명 후속 응답에는 기존 예보만 남고 비교 카드가 생기지 않는다.
test("followup 답변은 비교 카드를 만들지 않는다", async ({ page }) => {
  const messages = await routeSession(page, contract("valid-followup-why"));
  await page.goto("/consult?theme=day");
  await sendExample(page);
  await page.getByRole("button", { name: "왜 이렇게 많아?" }).click();
  await expect(
    page.getByText("토요일 저녁에 열려서 평소보다 사람이 많이 몰려요"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "원래 예보와 바뀐 예보 비교" }),
  ).toHaveCount(0);
  expect(messages[1].text).toBe("왜 이렇게 많아?");
});
