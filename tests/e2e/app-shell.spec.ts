// 여덟 데스크톱 상태와 모바일 홈의 화면 결과를 저장한다.

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const screens = [
	{ name: "home", path: "/", title: "미니 대한민국" },
	{ name: "consult", path: "/consult", title: "예보 상담" },
	{ name: "forecast", path: "/f/demo", title: "예보서" },
	{ name: "validation", path: "/validation", title: "검증" },
];
const output = resolve(process.cwd(), "../../reports/figures/screens");

// 지정 화면의 글꼴과 테마가 적용된 뒤 전체 창을 캡처한다.
for (const screen of screens) {
	for (const theme of ["day", "night"] as const) {
		test(`${screen.name} ${theme} 화면`, async ({ page }) => {
			await page.setViewportSize({ width: 1366, height: 768 });
			await page.goto(
				`${screen.path}?theme=${theme}&at=2026-10-18T19:00+09:00`,
			);
			await page.evaluate(() => document.fonts.ready);
			await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
			await expect(
				page.getByRole("heading", {
					name: screen.title,
					exact: true,
					level: 1,
				}),
			).toBeVisible();
			expect(
				await page.evaluate(() =>
					document.fonts.check('16px "Pretendard Variable"'),
				),
			).toBe(true);
			await page.screenshot({
				path: resolve(output, `T-401-${screen.name}-${theme}.png`),
			});
		});
	}
}

// 모바일 홈에서 장면과 떠 있는 목록을 세로로 읽을 수 있는지 남긴다.
test("home mobile 화면", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/?theme=day&at=2026-10-18T12:00+09:00");
	await page.evaluate(() => document.fonts.ready);
	await expect(
		page.getByRole("heading", { name: "미니 대한민국", level: 1 }),
	).toBeVisible();
	await expect(page.getByRole("heading", { name: "행사 목록" })).toBeVisible();
  await page.screenshot({
    path: resolve(output, "T-401-home-mobile.png"),
    fullPage: true,
  });
});

// 사용자가 고른 테마와 메뉴 위치가 이동·새로고침 뒤에도 유지되는지 확인한다.
test("테마 선택과 메뉴 이동", async ({ page }) => {
  await page.goto("/?at=2026-10-18T19:00+09:00");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await page.getByRole("combobox", { name: "화면 테마" }).selectOption("day");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "화면 테마" })).toHaveValue("day");
  await page.getByRole("link", { name: "검증", exact: true }).click();
  await expect(page.getByRole("link", { name: "검증", exact: true })).toHaveClass(/is-active/);
});
