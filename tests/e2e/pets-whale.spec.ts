// 고래 펫 견본의 낮·밤 테마와 상담 작업판을 스크린샷으로 남긴다.
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const output = resolve(process.cwd(), "../../reports/figures/screens");

// 다섯 상태와 열세 역할이 낮·밤 견본에서 모두 보이는지 확인한다.
for (const theme of ["day", "night"] as const) {
	test(`고래 펫 견본 ${theme}`, async ({ page }) => {
		await page.setViewportSize({ width: 1366, height: 768 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(`/dev/pets?theme=${theme}&at=2026-10-18T12:00+09:00`);
		await page.evaluate(() => document.fonts.ready);
		await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
		await expect(page.locator(".pets-gallery__state")).toHaveCount(5);
		await expect(page.locator(".pets-gallery__state .pet-avatar")).toHaveCount(
			65,
		);
		await page.screenshot({
			path: resolve(output, `T-430b-pets-${theme}.png`),
			fullPage: true,
		});
	});
}

// 상담의 실제 작업판에서 열세 고래와 이름표를 함께 남긴다.
test("고래 펫 상담 작업판", async ({ page }) => {
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await page.evaluate(() => document.fonts.ready);
	await expect(
		page.getByRole("heading", { name: "예보팀 작업판" }),
	).toBeVisible();
	await expect(page.locator(".team-board .pet-avatar")).toHaveCount(13);
	await page.locator(".team-board").screenshot({
		path: resolve(output, "T-430b-board.png"),
	});
});
