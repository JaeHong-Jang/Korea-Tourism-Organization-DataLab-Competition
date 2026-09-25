// S1 로컬 2D 지도에서 타일, 선택 동기화, 테마와 외부 요청 차단을 확인한다.
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const screens = resolve(process.cwd(), "../../reports/figures/screens");
const day = encodeURIComponent("2026-10-18T12:00:00+09:00");
const night = encodeURIComponent("2026-10-18T21:00:00+09:00");

// 외부 호스트와 PMTiles Range 응답을 관찰하며 지도 점·목록·요약을 왕복한다.
test("2D 전환과 로컬 타일, 행사 선택, 낮·밤", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const external: string[] = [];
  const tileStatuses: number[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && new URL(url).hostname !== "127.0.0.1") {
      external.push(url);
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("korea-z13.pmtiles")) {
      tileStatuses.push(response.status());
    }
  });

  // 주소 선택 없이 3D에서 시작한 뒤 버튼으로 2D 지도에 들어간다.
  await page.goto(`/?sceneFixture=1&theme=day&at=${day}`);
  await page.getByRole("button", { name: "2D 지도" }).click();
  await expect(page).toHaveURL(/view=2d/);
  await expect(
    page.getByRole("region", { name: "대한민국 행사 2D 지도" }),
  ).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".map-2d__hint")).toBeVisible();
  await expect
    .poll(() => tileStatuses.length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  expect(tileStatuses.every((status) => status === 200 || status === 206)).toBe(
    true,
  );
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText(
    "OpenStreetMap",
  );

  // 한 행사만 남기면 목록이 선택한 점으로 지도를 옮기고 Esc 뒤 지도 점을 누를 수 있다.
  await page.getByLabel("기간").selectOption("two-weeks");
  await page.getByLabel("시도").selectOption("서울특별시");
  await page.getByLabel("유형").selectOption("불꽃");
  await page.getByRole("combobox", { name: "등급" }).selectOption("1");
  await expect(page.locator(".festival-list__items > li")).toHaveCount(1);
  await page.locator(".festival-list__pick").click();
  await expect(page.locator(".map-2d__overzoom")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "선택 행사 요약" }),
  ).toContainText("견본 행사 1");
  await expect(page.locator(".map-2d__popup")).toContainText("1등급");
  await page.waitForTimeout(700);
  const popup = await page.locator(".maplibregl-popup").boundingBox();
  expect(popup).not.toBeNull();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "선택 행사 요약" }),
  ).toHaveCount(0);
  if (popup)
    await page.mouse.click(
      popup.x + popup.width / 2,
      popup.y + popup.height + 18,
    );
  await expect(
    page.getByRole("region", { name: "선택 행사 요약" }),
  ).toContainText("견본 행사 1");
  await page.screenshot({ path: resolve(screens, "T-403-day.png") });

  // 테마 변경 후에도 2D 보기를 복원하며 밤 스프라이트와 로컬 타일만 읽는다.
  await page.goto(`/?sceneFixture=1&view=2d&theme=night&at=${night}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(
    page.getByRole("region", { name: "대한민국 행사 2D 지도" }),
  ).toBeVisible();
  await expect(page.locator(".map-2d__hint")).toBeVisible();
  await expect
    .poll(() => tileStatuses.length, { timeout: 30_000 })
    .toBeGreaterThan(1);
  await page.screenshot({ path: resolve(screens, "T-403-night.png") });
  expect(external).toEqual([]);
});
