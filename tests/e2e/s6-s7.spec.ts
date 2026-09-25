// 계약 모양의 게이트웨이 응답으로 검증·인사이트 화면을 끝까지 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const output = resolve(process.cwd(), "../../reports/figures/screens");
const usageDatasets = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../../services/knowledge/tests/fixtures/queries/datalab_usage.json",
    ),
    "utf8",
  ),
) as { datasetId: string; title: string; datalabMenu: string | null }[];
const backtest = {
  runId: "bt-v1-064e60073a7411037212",
  modelRunId: "mr-v1-064e60073a7411037212",
  modelVersion: "v1-064e60073a7411037212",
  target: "일평균 방문객",
  evalYears: [2025],
  metrics: {
    mdape: 49.33759813857037,
    coverage80: 49 / 86,
    coverageN: 86,
    judgmentRecall: 1,
    judgmentPrecision: 1,
    baselineDeltaPp: null,
    comparablePairs: 0,
  },
  points: [
    {
      eventId: "e-2025-26530-356df7c5fd",
      name: "2025 부산국제록페스티벌",
      year: 2025,
      tier: "silver",
      actual: 36888.346667,
      p10: 8389.771315808828,
      p50: 14500.477500000008,
      p90: 25201.138098875268,
      level: 4,
      actualLevel: 4,
    },
    {
      eventId: "e-2025-41800-7d4625c4a0",
      name: "제32회 연천 구석기 축제",
      year: 2025,
      tier: "goldA",
      actual: 46631.25,
      p10: 14058.939631846168,
      p50: 37263.00000000002,
      p90: 50275.84935324195,
      level: 4,
      actualLevel: 4,
    },
    {
      eventId: "e-2025-26470-ee9bd118fd",
      name: "제6회 연제고분판타지축제",
      year: 2025,
      tier: "silver",
      actual: 17263.885,
      p10: 9430.243867327232,
      p50: 24995.257500000014,
      p90: 33724.125395082236,
      level: 4,
      actualLevel: 4,
    },
  ],
  golden: [],
  disclosure: {
    evaluated: 86,
    covered: 49,
    byTier: { gold: 1, silver: 85 },
    skippedYears: [{ year: 2024, reason: "학습 2 < 최소 20 (학습 ≤ 2022)" }],
    unscorable: 34,
    belowThresholdActual: 0,
    baselinePairs: { b0: 86, b1: 1, b2: 0 },
  },
};
const model = {
  id: "mr-v1-f0667d86aafd47d09472",
  modelVersion: backtest.modelVersion,
  target: "일평균 방문객",
  trainRange: { from: "2022-01-01", to: "2024-12-31" },
  features: ["행사 유형", "시군구 평시 방문자"],
  evalYears: [2025],
  backtestRunId: backtest.runId,
  createdAt: "2026-09-25T12:00:00+09:00",
  notes: "골드 표본이 적습니다.\n\n명절 실버는 채점할 수 없습니다.",
};
const usage = {
  generatedAt: "2026-09-25T12:00:00+09:00",
  publishedClaims: 0,
  claimsWithEvidence: 0,
  claimsReachingDatalab: 0,
  shaclPassRate: null,
  evidenceByDataset: usageDatasets.map(({ datasetId, title, datalabMenu }) => ({
    datasetId,
    title,
    datalabMenu,
    count: 0,
  })),
};
const ledger = [
  {
    seq: 1,
    forecastId: "f-2025-bupyeong",
    eventId: "e-2025-28237-5556a61eef",
    registeredAt: "2026-09-29T12:00:00+09:00",
    leadDays: 14,
    forecast: {
      dailyMeanP10: 11000,
      dailyMeanP50: 22000,
      dailyMeanP90: 31000,
      level: 3,
    },
    payloadHash: "b".repeat(64),
    prevHash: "0".repeat(64),
    hash: "a".repeat(64),
  },
];

// 자료가 없는 API는 503으로 응답하고 나머지는 계약 JSON을 반환한다.
async function fakeGateway(page: Page) {
  const replies: Record<string, unknown> = {
    "/api/validation/backtest": backtest,
    "/api/validation/model-card": model,
    "/api/evidence/stats": usage,
    "/api/records/ledger/verify": { valid: true, count: 1, brokenAt: null },
    "/api/records/ledger": ledger,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path in replies)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(replies[path]),
      });
    else
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
  });
}

// 데스크톱 두 테마에서 전 영역과 원장 검증 행동을 확인한다.
for (const theme of ["day", "night"] as const) {
  test(`S6 ${theme} 성적·근거·원장`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await fakeGateway(page);
    await page.goto(`/validation?theme=${theme}`);
    await expect(page.locator('[data-feature="M6-F1"]')).toContainText("49.3%");
    await expect(page.locator('[data-feature="M6-F1"]')).toContainText("57.0%");
    await expect(page.locator('[data-feature="M6-F2"]')).toContainText(
      "예측 대상 · 실측 대상3건",
    );
    await expect(
      page.locator('[data-feature="M6-F2"] [data-point]'),
    ).toHaveCount(3);
    await page.getByRole("button", { name: "표 보기" }).click();
    await expect(page.locator('[data-feature="M6-F2"] table')).toContainText(
      "연천 구석기 축제",
    );
    await page.getByRole("button", { name: "차트 보기" }).click();
    await expect(page.locator('[data-feature="M6-F3"]')).toContainText(
      "골든 사례 0건 — 사례 재현 검증 전 임시 사용",
    );
    await expect(page.locator('[data-feature="M6-F5"]')).toContainText(
      "발행 문장이 아직 없어요",
    );
    await expect(page.locator('[data-feature="M6-F5"] li')).toHaveCount(14);
    await expect(page.locator('[data-feature="M6-F6"]')).toContainText(
      "명절 실버는 채점할 수 없습니다.",
    );
    await page.getByRole("button", { name: "해시 체인 검증" }).click();
    await expect(page.locator('[data-feature="M6-F4"]')).toContainText(
      "검증 통과 · 1건 · 마지막 해시 aaaaaaaaaaaa",
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(output, `T-407-s6-${theme}.png`),
      fullPage: true,
    });
  });
}

// 모바일에서는 모든 검증 패널이 한 열에 남는지 확인한다.
test("S6 모바일", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeGateway(page);
  await page.goto("/validation?theme=day");
  await expect(page.locator('[data-feature="M6-F6"]')).toContainText(
    "v1-064e60073a7411037212",
  );
  await expect(page.locator('[data-feature="M6-F2"] table')).toBeVisible();
  await expect(page.getByRole("button", { name: "차트 보기" })).toBeVisible();
  // 키보드로 가로 표를 움직여 마지막 실측 열까지 닿는지 확인한다.
  const table = page.getByRole("region", {
    name: "예측·실측 표, 좌우로 스크롤",
  });
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => table.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  const lastColumnReachable = await table.evaluate((element) => {
    element.scrollLeft = element.scrollWidth - element.clientWidth;
    const lastCell = element.querySelector("tbody tr td:last-child");
    return (
      !!lastCell &&
      lastCell.getBoundingClientRect().right <=
        element.getBoundingClientRect().right
    );
  });
  expect(lastColumnReachable).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: resolve(output, "T-407-s6-mobile.png"),
    fullPage: true,
  });
});

// 인사이트 미공개 상태에서는 견본 지표와 복사 버튼이 없어야 한다.
test("S7 빈 상태", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await fakeGateway(page);
  await page.goto("/insights?theme=day");
  await expect(page.locator('[data-feature="M7-F1"]')).toContainText(
    "인사이트는 데이터 수집이 끝나면 채워져요 · 9/27",
  );
  await expect(
    page.getByRole("button", { name: "서식4용 문장 복사" }),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: resolve(output, "T-407-s7.png"),
    fullPage: true,
  });
});

// 계약 밖의 값은 통계 대신 오류 문장으로 바꾸고 수치를 남기지 않는다.
test("S6 근거 계약 위반", async ({ page }) => {
  await fakeGateway(page);
  await page.route("**/api/evidence/stats", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...usage, publishedClaims: "10" }),
    }),
  );
  await page.goto("/validation?theme=day");
  const panel = page.locator('[data-feature="M6-F5"]');
  await expect(panel.getByRole("alert")).toContainText(
    "자료 형식을 확인할 수 없어요",
  );
  await expect(panel).not.toContainText("데이터셋별 근거 인용");
});

// 정상 상태 코드여도 JSON이 깨지면 성적 숫자 대신 오류 상태만 남긴다.
test("S6 성적 JSON 파싱 실패", async ({ page }) => {
  await fakeGateway(page);
  await page.route("**/api/validation/backtest", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{broken",
    }),
  );
  await page.goto("/validation?theme=day");
  const panel = page.locator('[data-feature="M6-F1"]');
  await expect(panel.getByRole("alert")).toContainText(
    "자료 형식을 확인할 수 없어요",
  );
  await expect(panel).not.toContainText("49.3%");
});
