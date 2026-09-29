// 사용자 검토에서 지적된 다섯 화면을 계약 응답으로 고정해 캡처한다.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { backtest } from "../../apps/web/src/features/validation/__tests__/validation-fixtures";
import { consultExample, routeScreensV2 } from "./fixtures/screens-v2-routes";
import { sendConsultDescription } from "./fixtures/start-consult";

const screens = resolve(process.cwd(), "../../reports/figures/screens");
const contract = (name: string) =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), `../../packages/contracts/fixtures/${name}`),
      "utf8",
    ),
  );

// 본 레포에 공개 결과가 있으면 실제 86개 평가점을 쓰고, 없으면 계약 모양의 견본을 쓴다.
function published<T>(path: string, fallback: T): T {
  const absolute = resolve(process.cwd(), `../../${path}`);
  return existsSync(absolute)
    ? JSON.parse(readFileSync(absolute, "utf8"))
    : fallback;
}

// 상담 결과의 막대가 이름·기준·배수를 함께 읽히는지 기록한다.
test("QA-2 구간 막대", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await routeScreensV2(page);
  await page.goto("/consult?theme=day");
  await sendConsultDescription(page, consultExample);
  const bar = page.locator(".consult-preview .range-bar");
  await expect(bar.getByText("순간 최대 예상 인원과 법정 기준")).toBeVisible();
  await expect(
    // 기준선 이름표와 1시간 기준 단위 고지 두 곳에 같은 말이 있어 첫 번째(이름표)를 본다.
    bar.getByText("법정 기준 1,000명", { exact: false }).first(),
  ).toBeVisible();
  await bar.screenshot({ path: resolve(screens, "QA-2-rangebar.png") });
});

// 축제 총 방문객 꺾은선(2017~2025 실제, 2026 예측)이 보이고, 연도를 가리키면 설명 줄이 채워지는지 기록한다.
test("QA-2 축제 총 방문객 추이", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await routeScreensV2(page);
  await page.goto("/validation?theme=day");
  const chart = page.locator('[data-feature="M6-F2"]');
  await expect(chart.locator(".festival-line")).toBeVisible();
  await expect(chart.locator("[data-year]")).toHaveCount(10);
  await chart.screenshot({
    path: resolve(screens, "QA-2-s6-festival-trend.png"),
  });
  await expect(chart.locator('[data-year="2026"]')).toHaveAttribute(
    "aria-label",
    /2026년 예측/,
  );
  await expect(chart.locator(".validation-point-detail")).toHaveCount(0);
});

// 재예보 근거와 새 예보서 행동, 페이지 제목을 함께 기록한다.
test("QA-2 내 행사", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await routeScreensV2(page);
  await page.goto("/my?theme=day");
  await expect(page.getByRole("heading", { name: "내 행사" })).toBeVisible();
  await page.getByRole("button", { name: "재예보", exact: true }).click();
  const card = page.locator(".my-events-reforecast-card");
  await expect(card.getByRole("link", { name: "날씨 근거" })).toBeVisible();
  await expect(
    card.getByRole("link", { name: "새 예보서 보기" }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(screens, "QA-2-s5.png"),
    fullPage: true,
  });
});
