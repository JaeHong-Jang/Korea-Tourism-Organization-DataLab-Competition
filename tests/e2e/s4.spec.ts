// S4 목차 이동과 메모 자동 저장, docx 내려받기를 가짜 API로 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { planFixture } from "./fixtures/plan-yeongjong";

const report = JSON.parse(readFileSync(resolve(process.cwd(), "../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json"), "utf8"));
const screens = resolve(process.cwd(), "../../reports/figures/screens");

// 저장본과 발행 스냅샷을 분리해 목차·PUT·다운로드가 실제 경로를 쓰는지 검사한다.
test("S4 계획 초안 메모와 docx", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let saved = structuredClone(planFixture);
  let putCount = 0;
  await page.route("**/api/forecasts/f-yeongjong-2025/plan", (route) => {
    expect(route.request().method()).toBe("POST");
    return route.fulfill({ json: { plan: saved, docxHref: "/api/plans/plan-yeongjong-example/export.docx" } });
  });
  await page.route("**/api/forecasts/f-yeongjong-2025", (route) => route.fulfill({ json: report }));
  await page.route("**/api/plans/plan-yeongjong-example", (route) => route.fulfill({ json: saved }));
  await page.route("**/api/records/plans/plan-yeongjong-example", (route) => {
    expect(route.request().method()).toBe("PUT");
    putCount++;
    saved = { ...route.request().postDataJSON(), updatedAt: "2026-09-25T09:01:00+09:00" };
    return route.fulfill({ json: saved });
  });
  await page.route("**/api/plans/plan-yeongjong-example/export.docx", (route) => route.fulfill({
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": 'attachment; filename="plan-yeongjong-example.docx"',
    },
    body: "fixture-docx",
  }));

  // 목차 이동과 잠금 숫자 표시를 먼저 찍고 작성자 메모를 저장한다.
  await page.goto("/f/f-yeongjong-2025/plan");
  await expect(page.getByRole("navigation", { name: "계획 초안 목차" }).getByRole("button")).toHaveCount(9);
  await page.getByRole("navigation", { name: "계획 초안 목차" }).getByRole("button", { name: /5\. 인력 배치/ }).click();
  await expect(page.locator("#plan-heading-staffing")).toBeFocused();
  await expect(page.getByText("p50 · 21000 명")).toBeVisible();
  await page.screenshot({ path: resolve(screens, "T-408-editor.png") });
  await page.locator("#notes-staffing").fill("안전요원 배치표 확인");
  await expect(page.getByRole("status").filter({ hasText: "저장됨" })).toBeVisible();
  expect(putCount).toBe(1);
  expect(saved.sections[4].notes).toBe("안전요원 배치표 확인");
  await page.screenshot({ path: resolve(screens, "T-408-saved.png") });

  // 저장된 메모가 있는 상태에서만 docx 링크를 연다.
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "docx 받기" }).click();
  expect((await download).suggestedFilename()).toBe("plan-yeongjong-example.docx");
});
