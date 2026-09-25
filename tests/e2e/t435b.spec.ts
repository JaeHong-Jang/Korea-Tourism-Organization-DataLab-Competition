// 전체 QA 2회차의 날씨·패널·상담 화면을 고정 자료로 남긴다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import { expect, test } from "@playwright/test";
import { sendConsultDescription } from "./fixtures/start-consult";

const screens = resolve(process.cwd(), "../../reports/figures/screens");
const at = encodeURIComponent("2025-10-18T21:00:00+09:00");

// 비가 오는 밤에 판 안쪽 효과와 장면 도구를 함께 촬영한다.
test("비 오는 밤의 장면과 저장 도구", async ({ page }) => {
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.route("**/api/weather?**", (route) => {
		const query = new URL(route.request().url()).searchParams;
		return route.fulfill({
			json: {
				lat: Number(query.get("lat")),
				lng: Number(query.get("lng")),
				at: query.get("at"),
				sky: "흐림",
				pty: "비",
				temp: 18,
				pop: 80,
				source: "초단기실황",
				fetchedAt: query.get("at"),
			},
		});
	});
	await page.goto(`/?sceneFixture=1&sceneQuality=high&theme=night&at=${at}`);
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{
			timeout: 45_000,
		},
	);
	await expect(page.locator(".weather-chip--forecast")).toContainText("비");
	await page.getByRole("button", { name: "장면 저장" }).click({ trial: true });
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: resolve(screens, "T-435b-s1-rain-night.png") });
});

// 낮은 데스크톱과 전화 폭에서 필터 칸이 스크롤과 문서 순서대로 보인다.
test("1366 필터와 네 폭의 장면 도구", async ({ page }) => {
	for (const width of [1366, 1024, 768, 390]) {
		await page.setViewportSize({ width, height: 768 });
		await page.goto("/?sceneFixture=1&sceneQuality=high&theme=day");
		await expect(page.locator("html")).toHaveAttribute(
			"data-scene-ready",
			"true",
			{
				timeout: 45_000,
			},
		);
		await page
			.getByRole("button", { name: "장면 저장" })
			.click({ trial: true });
		if (width === 1366) {
			const grade = page.getByRole("combobox", { name: "등급" });
			await grade.scrollIntoViewIfNeeded();
			await expect(grade).toBeInViewport();
			await page.screenshot({ path: resolve(screens, "T-435b-s1-1366.png") });
		}
	}
});

// 직접 기간을 여는 전화 필터는 기간과 유형을 날짜보다 먼저 보여 준다.
test("390 필터의 첫줄과 날짜", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/?sceneFixture=1&forceSvg=1&theme=day");
	await page
		.getByRole("combobox", { name: "기간", exact: true })
		.selectOption("custom");
	await expect(page.getByRole("combobox", { name: "유형" })).toBeVisible();
	const period = await page
		.getByRole("combobox", { name: "기간", exact: true })
		.boundingBox();
	const type = await page.getByRole("combobox", { name: "유형" }).boundingBox();
	const date = await page.getByLabel("시작일").boundingBox();
	expect(period && date && period.y < date.y).toBe(true);
	expect(period && type && Math.abs(period.y - type.y) < 2).toBe(true);
	await page.screenshot({
		path: resolve(screens, "T-435b-s1-390.png"),
		fullPage: true,
	});
});

// 계약 SSE의 수치 문장만 쉼표로 바뀐 상담 화면을 저장한다.
test("상담 말풍선의 자리표시자 숫자", async ({ page }) => {
	const events = JSON.parse(
		readFileSync(
			resolve(
				process.cwd(),
				"../../packages/contracts/fixtures-sse/valid-new-forecast.json",
			),
			"utf8",
		),
	) as SseEvent[];
	const frames = events
		.map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
		.join("");
	await page.route("**/api/team/sessions", (route) =>
		route.fulfill({ json: { sessionId: "s-demo-0001" } }),
	);
	await page.route("**/api/team/sessions/*/messages", (route) =>
		route.fulfill({
			status: 200,
			contentType: "text/event-stream",
			body: frames,
		}),
	);
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto("/consult?theme=day");
	await sendConsultDescription(
		page,
		"10월 18일 19시부터 21시까지 영종 씨사이드파크에서 인천 중구가 여는 불꽃축제를 해요",
	);
	await expect(
		page
			.locator(".consult-bubble__text")
			.getByText("순간 최대는 21,000명 안팎으로 예상돼요"),
	).toBeVisible();
	await page.screenshot({
		path: resolve(screens, "T-435b-s2-claims.png"),
		fullPage: true,
	});
});
