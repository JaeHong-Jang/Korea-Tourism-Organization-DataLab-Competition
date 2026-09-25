// 세 시범 행사장의 실제 타일과 시각 전환·모션 감소를 브라우저에서 확인한다.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const screens = resolve(process.cwd(), "../../reports/figures/screens");

// 고정된 화면 크기와 시각으로 세 장소의 낮·밤 캡처를 남긴다.
for (const key of ["yeongjong", "hangang", "suwon"] as const) {
  test(`${key} 타일 장면과 낮·밤`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/dev/venue/${key}?sceneQuality=low&venueHour=12`);
    await expect
      .poll(() => page.locator("html").getAttribute("data-venue-ready"), {
        timeout: 45000,
      })
      .toBe("true");
    expect(
      Number(await page.locator("html").getAttribute("data-venue-buildings")),
    ).toBeGreaterThan(0);
    expect(
      Number(await page.locator("html").getAttribute("data-venue-cars")),
    ).toBeGreaterThan(0);
    await expect(page.locator("html")).toHaveAttribute("data-venue-sky", "day");
    mkdirSync(screens, { recursive: true });
    await page.screenshot({ path: resolve(screens, `T-434-${key}-day.png`) });
    const slider = page.getByRole("slider", { name: /행사일 시간대/ });
    await slider.focus();
    await slider.press("End");
    await expect(page.locator("html")).toHaveAttribute(
      "data-venue-sky",
      "night",
    );
    await page.screenshot({ path: resolve(screens, `T-434-${key}-night.png`) });
  });
}

// 모션 감소 설정에서는 슬라이더를 움직여도 같은 차량 행렬이 유지된다.
test("모션 감소 시 차량 위치가 고정된다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/venue/hangang?sceneQuality=low&venueHour=12");
  await expect
    .poll(() => page.locator("html").getAttribute("data-venue-ready"), {
      timeout: 45000,
    })
    .toBe("true");
  const before = await page.evaluate(() => window.__crowdcastVenueVehicle?.());
  const slider = page.getByRole("slider", { name: /행사일 시간대/ });
  await slider.focus();
  await slider.press("End");
  await expect(page.locator("html")).toHaveAttribute("data-venue-sky", "night");
  const after = await page.evaluate(() => window.__crowdcastVenueVehicle?.());
  expect(after).toEqual(before);
});
