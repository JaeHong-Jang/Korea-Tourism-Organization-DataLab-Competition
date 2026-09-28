// 발행 예보 선택·상세·내 행사 연결을 실제 브라우저에서 확인한다.
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import usage from "../../packages/contracts/fixtures/datalab-usage/valid-example.json" with {
  type: "json",
};
import fixture from "../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json" with {
  type: "json",
};

const older = structuredClone(fixture);
const newer = structuredClone(fixture);
newer.forecastId = "f-yeongjong-2026-new";
newer.forecast.id = newer.forecastId;
newer.publishedAt = "2026-09-27T12:30:00+09:00";
newer.forecast.peakConcurrent.p50 = 22222;
const screens = resolve(process.cwd(), "../../reports/figures/screens");

// 수치 변경이 분명한 두 발행본을 제공하고 공통 그래프 실패를 별도로 만든다.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, json: { message: "테스트 대상 밖 서비스" } }),
  );
  await page.route("**/api/records/events", (route) =>
    route.fulfill({ json: [older.event] }),
  );
  await page.route("**/api/records/events/*/snapshots", (route) =>
    route.fulfill({ json: [older, newer] }),
  );
  await page.route("**/api/forecasts/*", (route) =>
    route.fulfill({
      json: route.request().url().endsWith(newer.forecastId) ? newer : older,
    }),
  );
  await page.route("**/api/evidence/graph", (route) =>
    route.fulfill({ status: 503, json: { message: "기준 그래프 점검 중" } }),
  );
});

// 주 메뉴는 역할별로 한 번만 표시하고 전체 발행 통계는 운영에서만 읽는다.
test("모델 검증·예보 근거·운영의 역할을 분리한다", async ({ page }) => {
  let statsRequests = 0;
  await page.route("**/api/evidence/stats", (route) => {
    statsRequests += 1;
    return route.fulfill({ json: usage });
  });
  await page.goto("/validation");
  const menu = page.getByRole("navigation", { name: "주 메뉴" });
  const main = page.getByRole("main");
  await expect(
    menu.getByRole("link", { name: "모델 검증", exact: true }),
  ).toHaveCount(1);
  await expect(
    menu.getByRole("link", { name: "예보 근거", exact: true }),
  ).toHaveCount(1);
  await expect(
    main.getByRole("heading", { name: "모델 검증", exact: true }),
  ).toBeVisible();
  await expect(main.locator('a[href="/graph"]')).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "검증 둘러보기" }),
  ).toHaveCount(0);
  await menu.getByRole("link", { name: "예보 근거", exact: true }).click();
  await expect(
    main.getByRole("heading", { name: "예보 근거", exact: true }),
  ).toBeVisible();
  await expect(main.locator('a[href="/validation"]')).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: "선택한 발행 예보의 근거" }),
  ).toBeVisible();
  // 전체 자료·규칙 연결 그래프는 선택한 예보 근거 오른쪽, 첫 화면 위쪽에 바로 보인다.
  const graphSection = page.getByRole("region", {
    name: "전체 자료·규칙 연결",
  });
  await expect(graphSection).toBeInViewport();
  expect(
    await page.evaluate(() => {
      const summary = document.querySelector(".snapshot-evidence__summary");
      const graph = document.querySelector(".knowledge-page__graph");
      return Boolean(
        summary &&
          graph &&
          graph.getBoundingClientRect().left >=
            summary.getBoundingClientRect().right,
      );
    }),
  ).toBe(true);
  await graphSection.scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "전체 그래프 재시도" }),
  ).toBeVisible();
  expect(statsRequests).toBe(0);
  await menu.getByRole("link", { name: "운영", exact: true }).click();
  await expect(
    main.getByRole("heading", { name: "전체 발행 기록의 근거 연결 현황" }),
  ).toBeVisible();
  await expect(main.getByText("근거 연결률", { exact: true })).toBeVisible();
  expect(statsRequests).toBeGreaterThan(0);
});

// 발행본 상세와 URL을 함께 검사해 선택 이력의 뒤로 가기도 보장한다.
test("과거 예보의 근거와 출처를 탐색하고 발행 시점을 바꾼다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(
    `/graph?eventId=${older.event.id}&forecastId=${older.forecastId}`,
  );
  const snapshot = page.getByRole("article", {
    name: "선택한 발행 예보의 근거",
  });
  await expect(snapshot).toContainText("21,000 명");
  await page.getByRole("button", { name: /2\. 순간 최대 환산/ }).click();
  await expect(
    page.getByRole("list", { name: "발행 예보 근거 목록" }).getByRole("button"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("complementary", { name: "선택한 근거 상세" }),
  ).toContainText("가정값");
  await page.getByRole("button", { name: "전체 근거", exact: true }).click();
  await page
    .getByRole("button", { name: /사용 확인 필요 인천 중구 평시 토요일 방문/ })
    .click();
  await expect(
    page.getByRole("link", { name: "출처 원문 열기" }),
  ).toHaveAttribute("href", "https://www.data.go.kr/data/15101972/openapi.do");
  await page.screenshot({
    path: resolve(screens, "forecast-evidence-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "예보 발행 시점" })
    .selectOption(newer.forecastId);
  await expect(snapshot).toContainText("22,222 명");
  await page.goBack();
  await expect(snapshot).toContainText("21,000 명");
  // 같은 화면 아래 그래프 구역을 열어도 선택한 예보 근거는 그대로 남는다.
  await page
    .getByRole("region", { name: "전체 자료·규칙 연결" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "전체 그래프 재시도" }),
  ).toBeVisible();
  await expect(snapshot).toContainText("21,000 명");
});

// 휴대폰에서는 경로가 세로로 바뀌고 긴 모델 식별자도 화면을 넘지 않는다.
test("모바일 화면에서 근거 선택과 내용 읽기가 가능하다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/graph?forecastId=${older.forecastId}`);
  await expect(
    page.getByRole("article", { name: "선택한 발행 예보의 근거" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /4\. 최종 판정/ }).click();
  await expect(
    page.getByRole("complementary", { name: "선택한 근거 상세" }),
  ).toContainText("판정에 사용");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(screens, "forecast-evidence-mobile.png"),
    fullPage: true,
  });
});

// 내 행사에 저장된 개별 발행 기록 링크가 그 예보의 근거 화면을 연다.
test("내 행사 예보 이력에서 해당 발행본 근거를 바로 연다", async ({ page }) => {
  await page.goto("/my");
  const link = page
    .getByRole("link", { name: "근거 보기 →", exact: true })
    .first();
  await expect(link).toHaveAttribute(
    "href",
    new RegExp(`forecastId=${older.forecastId}`),
  );
  await link.click();
  await expect(
    page.getByRole("article", { name: "선택한 발행 예보의 근거" }),
  ).toContainText("21,000 명");
});
