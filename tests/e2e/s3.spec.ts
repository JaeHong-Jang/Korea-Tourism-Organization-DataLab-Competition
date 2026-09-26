// 발행 예보서의 키보드 근거 이동과 인쇄·복사·docx 내려받기를 가짜 API로 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const report = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json",
    ),
    "utf8",
  ),
);
const screens = resolve(process.cwd(), "../../reports/figures/screens");

// 계약 픽스처 하나만 GET 응답으로 주고 계획서 POST와 파일 응답을 분리한다.
test("S3 예보서와 근거 서랍, 인쇄, 링크, docx", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let planRequests = 0;
  let exportRequests = 0;
  await page.route("**/api/forecasts/f-yeongjong-2025", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report),
    }),
  );
  await page.route("**/api/forecasts/f-yeongjong-2025/plan", (route) => {
    expect(route.request().method()).toBe("POST");
    planRequests++;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        docxHref: "/api/plans/plan-yeongjong/export.docx",
      }),
    });
  });
  await page.route("**/api/plans/**", (route) => {
    expect(new URL(route.request().url()).pathname).toBe(
      "/api/plans/plan-yeongjong/export.docx",
    );
    exportRequests++;
    return route.fulfill({
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="plan-yeongjong.docx"',
      },
      body: "fixture-docx",
    });
  });
  await page.goto("/f/f-yeongjong-2025");
  await expect(page.getByText("영종 씨사이드파크 불꽃축제")).toBeVisible();
  await expect(
    page.getByText("21,000", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      "폭죽을 쓰는 행사라 인원과 관계없이 안전관리계획 수립 대상이에요",
    ),
  ).toBeVisible();
  await page.screenshot({ path: resolve(screens, "T-406-report.png") });

  // 같은 근거 칩이 반복되어도 실제 눌렀던 칩에 Escape 포커스가 복귀한다.
  const chip = page.locator('a[href="#evidence-ev-rule-legal-hazard"]').first();
  await chip.focus();
  await chip.press("Enter");
  await expect(page.locator("#evidence-ev-rule-legal-hazard")).toHaveAttribute(
    "open",
    "",
  );
  await expect(
    page.getByText("재난 및 안전관리 기본법 시행령 제73조의9"),
  ).toBeVisible();
  await page.screenshot({ path: resolve(screens, "T-406-drawer.png") });
  await page.keyboard.press("Escape");
  await expect(chip).toBeFocused();

  // A4 미디어에서 판정·수치·체크리스트가 남는 인쇄 화면을 기록한다.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("준비 체크리스트")).toBeVisible();
  await page.screenshot({ path: resolve(screens, "T-406-print.png") });
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: "링크 복사" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "/f/f-yeongjong-2025",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "계획 초안 docx 받기" }).click();
  expect((await download).suggestedFilename()).toBe("plan-yeongjong.docx");
  expect(planRequests).toBe(1);
  expect(exportRequests).toBe(1);
});
