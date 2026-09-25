// 발행 스냅샷의 근거 정리를 키보드와 출처 카드로 살펴보는 경로를 확인한다.
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
test("S3 근거 정리에서 카드와 출처로 이동한다", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	let reportRequests = 0;
	const otherApi: string[] = [];
	// 근거 지도는 스냅샷 하나로 그린다 — 예보서 말고 다른 API(knowledge 근거·세션)를 부르지 않는다.
	page.on("request", (request) => {
		const path = new URL(request.url()).pathname;
		// 헤더 날씨 칩(모든 화면 공통)의 /api/weather는 근거 지도와 무관하다.
		if (
			path.startsWith("/api/") &&
			path !== "/api/forecasts/f-yeongjong-2025" &&
			path !== "/api/weather"
		)
			otherApi.push(path);
	});
	await page.route("**/api/forecasts/f-yeongjong-2025", (route) => {
		reportRequests++;
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(report),
		});
	});
	await page.goto("/f/f-yeongjong-2025");
	await page.getByRole("tab", { name: "근거 정리" }).click();
	await expect(page.getByRole("region", { name: "근거 정리" })).toBeVisible();
	await expect(page.getByRole("list", { name: "판정 흐름" })).toBeVisible();
	const evidence = page
		.locator(".evidence-brief__column button")
		.filter({ hasText: "[3]" })
		.first();
	await expect(evidence).toBeVisible();
	await page.screenshot({ path: resolve(screens, "T-413-map.png") });

	// Enter로 근거 카드를 연 뒤 Escape로 정확히 출발 카드에 초점을 되돌린다.
	await evidence.focus();
	await evidence.press("Enter");
	await expect(page.locator("#evidence-ev-rule-legal-hazard")).toHaveAttribute(
		"open",
		"",
	);
	await page.keyboard.press("Escape");
	await expect(evidence).toBeFocused();

	// 출처 카드는 법령 원문으로 이어지고, 문장별 근거는 예보서 탭으로 돌아간다.
	await expect(
		page
			.getByRole("region", { name: "근거와 출처" })
			.locator('a[href*="law.go.kr"]')
			.first(),
	).toBeVisible();
	await page.getByRole("button", { name: "예보서에서 보기" }).first().click();
	await expect(page.getByRole("tab", { name: "예보서" })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	// 개발 모드 StrictMode는 같은 요청을 두 번 보낼 수 있어 횟수 대신 다른 API가 없음을 본다.
	expect(reportRequests).toBeGreaterThan(0);
	expect(otherApi).toEqual([]);
});
