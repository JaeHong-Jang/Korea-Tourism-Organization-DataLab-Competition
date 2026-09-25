// 발행 스냅샷의 근거 지도를 키보드와 표로 살펴보는 경로를 확인한다.
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

// 가짜 GET 한 번으로 그래프·근거 서랍·표가 같은 스냅샷을 쓰는지 확인한다.
test("S3 근거 지도에서 카드와 표로 이동한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let reportRequests = 0;
  await page.route("**/api/forecasts/f-yeongjong-2025", (route) => {
    reportRequests++;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report),
    });
  });
  await page.goto("/f/f-yeongjong-2025");
  await page.getByRole("tab", { name: "근거 지도" }).click();
  await expect(
    page.getByRole("region", { name: "발행 문장과 근거 연결 그래프" }),
  ).toBeVisible();
  const evidence = page.getByRole("button", { name: /규정 \[3\]:/ });
  await expect(evidence).toBeVisible();
  await expect(page.locator(".react-flow__edge").first()).toBeVisible();
  await page.screenshot({ path: resolve(screens, "T-413-map.png") });

  // Enter로 카드를 연 뒤 Escape로 정확히 출발 노드에 초점을 되돌린다.
  await evidence.focus();
  await evidence.press("Enter");
  await expect(page.locator("#evidence-ev-rule-legal-hazard")).toHaveAttribute(
    "open",
    "",
  );
  await page.keyboard.press("Escape");
  await expect(evidence).toBeFocused();

  // 그래프와 표가 같은 카드 번호와 원문 자료를 표시한다.
  await page.getByRole("button", { name: "표로 보기" }).click();
  await expect(
    page.getByRole("table", {
      name: "발행 문장부터 데이터셋·문서까지의 근거 연결",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /\[3\].*인원 무관 대상/ }).first(),
  ).toBeVisible();
  await page.screenshot({ path: resolve(screens, "T-413-table.png") });
  expect(reportRequests).toBe(1);
});
