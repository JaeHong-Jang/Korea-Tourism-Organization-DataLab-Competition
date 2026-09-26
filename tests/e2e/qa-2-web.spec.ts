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

// 줄무늬 대신 점만 보이고 한 점을 가리킬 때 구간 하나가 나타나는지 기록한다.
test("QA-2 산점도", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await routeScreensV2(page);
  const data = published(
    "reports/backtest/bt-v1-064e60073a7411037212/backtest.json",
    backtest,
  );
  await page.route("**/api/validation/backtest", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/validation?theme=day");
  const chart = page.locator('[data-feature="M6-F2"]');
  await expect(chart.locator("[data-point]").first()).toBeVisible();
  await expect(chart.locator(".validation-whisker")).toHaveCount(0);
  await chart.screenshot({ path: resolve(screens, "QA-2-s6-scatter.png") });
  await chart.locator("[data-point]").first().focus();
  await expect(chart.locator(".validation-whisker")).toHaveCount(1);
});

// 모델 카드 원문이 요약 뒤 접힘 안에 들어간 상태를 기록한다.
test("QA-2 모델 카드", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await routeScreensV2(page);
  const data = published(
    "reports/backtest/bt-v1-064e60073a7411037212/backtest.json",
    backtest,
  );
  const card = published(
    "models/v1-064e60073a7411037212/model_card.json",
    contract("model-card/valid-v0-1-0.json"),
  );
  await page.route("**/api/validation/backtest", (route) =>
    route.fulfill({ json: data }),
  );
  await page.route("**/api/validation/model-card", (route) =>
    route.fulfill({ json: card }),
  );
  await page.goto("/validation?theme=day");
  const panel = page.locator('[data-feature="M6-F6"]');
  await expect(panel.getByText("원문 보기")).toBeVisible();
  await expect(panel.locator(".validation-limit-summary li")).toHaveCount(1);
  await expect(panel.locator(".validation-limit-summary")).not.toContainText("카드에 기록 없음");
  await panel.screenshot({ path: resolve(screens, "QA-2-s6-card.png") });
});

// 좁은 최신성 카드에서 긴 실행 ID와 미수집 자료가 칸 밖으로 나가지 않는지 기록한다.
test("QA-2 최신성 카드", async ({ page, context }) => {
  await page.setViewportSize({ width: 1100, height: 768 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await routeScreensV2(page);
  const status = contract("ops-status/valid-example.json");
  const modelRunId = "mr-v1-064e60073a7411037212";
  status.model.modelRunId = modelRunId;
  status.freshness.push({
    datasetId: "ds-kma-short-forecast",
    title: "기상청 단기예보",
    lastCollectedAt: null,
    lastObservedDate: null,
    rows: null,
  });
  await page.route("**/api/ops/status", (route) =>
    route.fulfill({ json: status }),
  );
  await page.goto("/ops?theme=day");
  const panel = page.locator('[data-feature="M8-F3"]');
  await expect(panel.getByText("아직 수집 전")).toBeVisible();
  await panel.getByRole("button", { name: "모델 실행 ID 복사" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    modelRunId,
  );
  expect(
    await panel.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await panel.screenshot({ path: resolve(screens, "QA-2-s8.png") });
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
