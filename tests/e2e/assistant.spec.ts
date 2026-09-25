// 고래 봇의 전역 서랍과 계약 픽스처 기반 추천·예보 흐름을 검사한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import { expect, type Page, test } from "@playwright/test";

const root = resolve(process.cwd(), "../..");
const screenshots = resolve(root, "reports/figures/screens");
const festival = JSON.parse(
  readFileSync(
    resolve(
      root,
      "packages/contracts/fixtures/festival-summary/valid-card.json",
    ),
    "utf8",
  ),
);
const document = (name: string): SseEvent[] => {
  const value = JSON.parse(
    readFileSync(
      resolve(root, "packages/contracts/fixtures-sse", `${name}.json`),
      "utf8",
    ),
  );
  return Array.isArray(value) ? value : value.events;
};
const frames = (events: SseEvent[]) =>
  events
    .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");

// 브라우저 요청은 모두 가짜 목록·세션·SSE로 응답한다.
async function routeAssistant(
  page: Page,
  events: (request: number) => SseEvent[],
) {
  const messages: { text: string; eventId?: string; answer?: object; near?: { lat: number; lng: number } }[] = [];
  await page.route("**/api/festivals", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([festival]),
    }),
  );
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
      body: frames(events(messages.length)),
    });
  });
  return messages;
}

// 홈에서 봇을 열고 목록 행사를 선택하면 eventId가 전송되고 S2에도 같은 카드가 남는다.
test("봇에서 행사 선택 뒤 예보서 미리보기", async ({ page }) => {
  const messages = await routeAssistant(page, () =>
    document("valid-new-forecast"),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "고래 봇 대화 열기" }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(screenshots, "T-442-bot.png") });
  await page.getByRole("button", { name: "고래 봇 대화 열기" }).click();
  await expect(
    page.getByRole("complementary", { name: "고래 봇 대화" }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(screenshots, "T-442-panel.png") });
  await page.getByRole("searchbox", { name: "다가오는 행사에서 고르기(패널)" }).fill("영종");
  await page
    .getByRole("button", { name: /영종 씨사이드파크 불꽃축제/ })
    .last()
    .click();
  await expect.poll(() => messages[0]?.eventId).toBe(festival.eventId);
  await page.getByRole("link", { name: "예보 상담", exact: true }).click();
  await expect(page.locator(".key-number strong").first()).toBeVisible();
  await page.screenshot({
    path: resolve(screenshots, "T-442-s2.png"),
    fullPage: true,
  });
});

// 방문객 문장은 recommend 카드로 나오고 숫자는 픽스처의 구간 그대로 표시한다.
test("방문객 추천 카드", async ({ page }) => {
  await routeAssistant(page, () => document("valid-recommend"));
  await page.goto("/consult");
  await page
    .getByLabel("행사를 설명해 주세요")
    .fill("불꽃놀이 행사에 가고 싶어");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.getByRole("region", { name: "추천 행사" })).toContainText(
    "영종 씨사이드파크 불꽃축제",
  );
  await expect(
    page.getByRole("button", { name: "지도에서 보기" }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(screenshots, "T-442-recommend.png") });
});

// 브라우저가 허락한 위치는 추천 메시지에만 넣고 추천 화면에는 행사 카드가 나온다.
test("내 위치로 가까운 축제를 찾는다", async ({ page, context }) => {
  const messages = await routeAssistant(page, () => document("valid-recommend"));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.4563, longitude: 126.7052 });
  await page.goto("/consult");
  await page.getByRole("button", { name: "내 위치로 가까운 축제" }).click();
  await expect.poll(() => messages[0]?.near).toEqual({ lat: 37.4563, lng: 126.7052 });
  await expect(page.getByRole("region", { name: "추천 행사" })).toBeVisible();
});

// 선택지가 없는 되묻기에는 별도 칸 없이 공용 입력칸으로 자유 답을 보낸다.
test("되묻기 자유 답", async ({ page }) => {
  const asking = document("valid-new-forecast").slice(0, 4);
  asking.push({
    event: "ask",
    seq: 4,
    data: { field: "venueText", question: "장소를 알려 주세요.", options: [] },
  } as SseEvent);
  asking.push({
    event: "done",
    seq: 5,
    data: { sessionId: "s-demo-0001", forecastId: null },
  } as SseEvent);
  const messages = await routeAssistant(page, (request) =>
    request === 1 ? asking : document("valid-new-forecast"),
  );
  await page.goto("/consult");
  await page
    .getByLabel("행사를 설명해 주세요")
    .fill("인천에서 불꽃축제를 해요");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.getByText("장소를 알려 주세요.")).toBeVisible();
  await page.getByLabel("답을 입력해 주세요").fill("영종 씨사이드파크");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect
    .poll(() => messages[1]?.answer)
    .toEqual({ venueText: "영종 씨사이드파크" });
});

// 움직임 줄이기에서도 사용자 고래 그림만 보여 준다.
test("움직임 줄이기에서는 사용자 고래 그림", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // 예보 상담 화면은 패널이 열려 봇 버튼을 숨기므로 첫 화면에서 본다
  await page.goto("/?sceneFixture=1");
  await expect(page.locator('.assistant-whale img[src="/assistant/whale.png"]')).toBeVisible();
  await expect(page.locator(".assistant-whale canvas")).toHaveCount(0);
});
