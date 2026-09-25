// S1 선택·상담 입력·데이터 모드·고지를 실제 브라우저 화면에서 확인한다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const output = resolve(process.cwd(), "../../reports/figures/screens");
const time = encodeURIComponent("2025-10-18T13:00:00+09:00");
const card = JSON.parse(
	readFileSync(
		resolve(
			process.cwd(),
			"../../packages/contracts/fixtures/festival-summary/valid-card.json",
		),
		"utf8",
	),
);

// 비 오는 밤의 API 응답이 헤더와 3D 장면에 함께 적용되는지 캡처한다.
test("현재 비·밤 날씨 칩과 장면", async ({ page }) => {
	await page.route("**/api/weather?**", (route) => {
		const url = new URL(route.request().url());
		return route.fulfill({
			json: {
				lat: Number(url.searchParams.get("lat")),
				lng: Number(url.searchParams.get("lng")),
				at: url.searchParams.get("at"),
				sky: "흐림",
				pty: "비",
				temp: 18,
				pop: 80,
				source: "초단기실황",
				fetchedAt: url.searchParams.get("at"),
			},
		});
	});
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto(
		`/?sceneFixture=1&view=miniature&theme=night&sceneQuality=high&at=${encodeURIComponent("2025-10-18T21:00:00+09:00")}`,
	);
	await expect(page.locator(".weather-chip--forecast")).toContainText(
		"서울 18° 비 · 밤",
	);
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{ timeout: 45_000 },
	);
	await expect(page.locator(".scene-legend")).toContainText(
		"날씨 효과 = 기상청 예보 기반 연출",
	);
	await page.screenshot({ path: resolve(output, "T-435-s1-rain-night.png") });
});

// 움직임 줄이기에서도 장면의 열차·봇 표시와 선택 해제를 확인한다.
test("연출 열차와 고른 행사 위 고래 봇", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(`/?sceneFixture=1&view=miniature&theme=day&sceneDiagnostic=1&at=${time}`);
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{ timeout: 30_000 },
	);
	await expect
		.poll(async () =>
			Number(await page.locator("html").getAttribute("data-scene-trains")),
		)
		.toBeGreaterThan(0);
	const first = await page.evaluate(() => window.__crowdcastTrainPosition?.());
	await page.waitForTimeout(150);
	expect(
		await page.evaluate(() => window.__crowdcastTrainPosition?.()),
	).toEqual(first);
	await expect(page.locator(".scene-legend")).toContainText(
		"열차·차량·봇·인형 움직임은 연출 — 실제 운행·교통량이 아니에요",
	);
	await page.screenshot({ path: resolve(output, "T-434a-s1-day.png") });
	await page.locator(".festival-list__pick").first().click();
	await expect
		.poll(async () =>
			Number(await page.locator("html").getAttribute("data-scene-bots")),
		)
		.toBeGreaterThan(0);
	await page.screenshot({ path: resolve(output, "T-434a-s1-selected.png") });
	await page.keyboard.press("Escape");
	await expect(page.locator("html")).toHaveAttribute("data-scene-bots", "0");
	await page.goto(
		`/?sceneFixture=1&view=miniature&theme=night&sceneDiagnostic=1&at=${encodeURIComponent("2025-10-18T21:00:00+09:00")}`,
	);
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{ timeout: 30_000 },
	);
	await page.screenshot({ path: resolve(output, "T-434a-s1-night.png") });
});

// 실제 버튼 경계가 장면 밖으로 나가거나 패널 아래에 숨지 않았는지 확인한다.
async function visibleTagsAreSafe(
	page: Page,
	requireOne = true,
): Promise<boolean> {
	return page
		.locator("button.scene-name-tag")
		.evaluateAll((buttons, requireOne) => {
			const stage = document
				.querySelector(".scene-stage")
				?.getBoundingClientRect();
			const panels = Array.from(
				document.querySelectorAll(
					".scene-left-rail, .scene-page > .scene-list, .scene-page > .scene-timeline, .scene-cta, .assistant-panel, .assistant-whale",
				),
				(panel) =>
					panel.getClientRects().length > 0
						? panel.getBoundingClientRect()
						: null,
			);
			const visiblePanels = panels.filter(
				(panel): panel is DOMRect => panel !== null,
			);
			return Boolean(
				stage &&
					(!requireOne || buttons.length > 0) &&
					buttons.every((button) => {
						const rect = button.getBoundingClientRect();
						return (
							rect.left >= stage.left &&
							rect.top >= stage.top &&
							rect.right <= stage.right &&
							rect.bottom <= stage.bottom &&
							visiblePanels.every(
								(other) =>
									rect.right <= other.left ||
									rect.left >= other.right ||
									rect.bottom <= other.top ||
									rect.top >= other.bottom,
							)
						);
					}) &&
					// 보이는 이름표끼리도 서로 겹치지 않는다(선택한 이름표가 먼저 자리를 잡는다)
					buttons.every((button, index) => {
						const rect = button.getBoundingClientRect();
						return buttons.slice(index + 1).every((other) => {
							const next = other.getBoundingClientRect();
							return (
								rect.right <= next.left ||
								rect.left >= next.right ||
								rect.bottom <= next.top ||
								rect.top >= next.bottom
							);
						});
					}),
			);
		}, requireOne);
}

// 투영한 전국 판 네 모서리가 장면 안이면서 떠 있는 패널 밖에 있는지 확인한다.
async function boardCornersAreSafe(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const stage = document
			.querySelector(".scene-stage")
			?.getBoundingClientRect();
		const corners = window.__crowdcastBoardCorners?.();
		const panels = Array.from(
			document.querySelectorAll(
				".scene-left-rail, .scene-page > .scene-list, .scene-page > .scene-timeline, .scene-cta, .scene-overview",
			),
			(panel) => panel.getBoundingClientRect(),
		);
		return Boolean(
			stage &&
				corners?.length === 4 &&
				corners.every(
					([x, y]) =>
						x >= stage.left &&
						x <= stage.right &&
						y >= stage.top &&
						y <= stage.bottom &&
						panels.every(
							(panel) =>
								x <= panel.left ||
								x >= panel.right ||
								y <= panel.top ||
								y >= panel.bottom,
						),
				),
		);
	});
}

// 진단용 OrbitControls 표적을 읽어 목록과 장면 키 입력을 구분한다.
async function cameraTarget(page: Page): Promise<number[] | null> {
	return page.evaluate(() => window.__crowdcastCameraTarget?.() ?? null);
}

// 견본 모드에서 목록 선택과 장면 이름표 선택은 하나의 행사 ID를 공유한다.
test("견본 선택, 해제, 상담 입력, 데이터 모드", async ({ page }) => {
	test.setTimeout(90_000);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(`/?sceneFixture=1&view=miniature&theme=day&sceneDiagnostic=1&at=${time}`);
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{ timeout: 30_000 },
	);
	await expect(page.locator(".scene-honest-notices")).toContainText(
		"골든 사례 0건 — 사례 재현 검증 전 임시 사용",
	);
	await expect(page.locator(".scene-honest-notices")).toContainText(
		"작은 행사는 크게 예보될 수 있어요",
	);
	await expect(page.locator(".scene-honest-notices")).toContainText(
		"견본 데이터",
	);
	await page.evaluate(() => document.fonts.ready);
	await expect.poll(() => boardCornersAreSafe(page)).toBe(true);
	await page.screenshot({ path: resolve(output, "T-433b-s1-day.png") });

	// 목록의 방향키는 다음 행사를 고를 뿐 카메라를 따로 밀지 않는다 — 클릭으로 고른 구도와 같아야 한다.
	await page.locator(".festival-list__pick").first().focus();
	await page.keyboard.press("ArrowDown");
	const listPick = page.locator(".festival-list__pick").nth(1);
	await expect(listPick).toBeFocused();
	await expect(listPick).toHaveAttribute("aria-pressed", "true");
	const afterListKey = await cameraTarget(page);
	await page.keyboard.press("Escape");
	await expect(listPick).toHaveAttribute("aria-pressed", "false");
	await listPick.click();
	await expect.poll(() => cameraTarget(page)).toEqual(afterListKey);
	await page.keyboard.press("Escape");
	// 방향키 카메라 이동은 장면에 포커스할 때만 한다.
	await page.locator(".scene-stage").focus();
	const beforeSceneKey = await cameraTarget(page);
	await page.keyboard.press("ArrowRight");
	await expect
		.poll(async () => (await cameraTarget(page))?.[0] ?? 0)
		.toBeCloseTo((beforeSceneKey?.[0] ?? 0) + 20);
	await page.getByRole("button", { name: "전국 보기" }).click();
	await expect.poll(() => boardCornersAreSafe(page)).toBe(true);

	// 타임라인이 커져도 이름표가 새 패널 경계 안에 남지 않게 한다.
	await page.getByText("주간 타임라인 펼치기").click();
	await expect.poll(() => visibleTagsAreSafe(page, false)).toBe(true);
	await page.getByText("주간 타임라인 펼치기").click();

	// 목록 선택은 장면 포커스와 요약 구간을 함께 갱신한다.
	await page
		.locator(".festival-list__pick")
		.filter({ hasText: "견본 행사 20" })
		.click();
	await expect(
		page.locator(".scene-stage section[data-focus-id]"),
	).toHaveAttribute("data-focus-id", "e-scene-20");
	await expect(
		page.getByRole("region", { name: "선택 행사 요약" }),
	).toContainText("견본 행사 20");
	await expect(
		page.getByRole("region", { name: "선택 행사 요약" }),
	).toContainText("표본 한계로 구간 기준 표시");
	await expect.poll(() => visibleTagsAreSafe(page)).toBe(true);
	await page.getByRole("button", { name: "전국 보기" }).click();
	await expect.poll(() => boardCornersAreSafe(page)).toBe(true);
	await page.screenshot({ path: resolve(output, "T-433-s1-selected.png") });

	// 전체 판으로 돌아온 뒤 패널에 가리지 않는 이름표를 골라 목록과 동기화한다.
	await page.keyboard.press("Escape");
	await expect(
		page.locator(".scene-stage section[data-focus-id]"),
	).toHaveAttribute("data-focus-id", "");
	await expect.poll(() => visibleTagsAreSafe(page)).toBe(true);
	const tag = page.locator("button.scene-name-tag").first();
	await expect(tag).toBeVisible();
	const tagName = await tag.getAttribute("aria-label");
	await tag.click();
	const chosenName = tagName?.replace(/ 선택$/, "") ?? "";
	await expect(
		page.locator(".festival-list__pick").filter({ hasText: chosenName }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(
		page.locator(".festival-list__items li.is-selected"),
	).toBeInViewport();
	await page.keyboard.press("Escape");
	await expect(
		page.locator(".scene-stage section[data-focus-id]"),
	).toHaveAttribute("data-focus-id", "");
	await expect(page.locator(".festival-summary__empty")).toBeVisible();

	// 상담 링크는 문장을 채우고 서버 전송은 시작하지 않는다.
	await page
		.locator(".festival-list__pick")
		.filter({ hasText: "견본 행사 20" })
		.click();
	// [이 행사 예보 받기]는 화면을 옮기지 않고 고래 봇 대화를 열어 고른 행사로 예보를 요청한다(T-442).
	const sessions: string[] = [];
	page.on("request", (request) => {
		if (
			request.method() === "POST" &&
			new URL(request.url()).pathname.startsWith("/api/team/sessions")
		)
			sessions.push(request.url());
	});
	await page.getByRole("link", { name: "이 행사 예보 받기" }).click();
	await expect(page.getByRole("complementary", { name: "고래 봇 대화" })).toBeVisible();
	await expect(page).toHaveURL(/\/(\?|$)/);
	await expect.poll(() => sessions.length).toBeGreaterThan(0);
	await page.getByRole("button", { name: "대화 닫기" }).click();
	await page.getByRole("button", { name: "데이터 모드 꺼짐" }).click();
	await expect(
		page.getByRole("button", { name: "데이터 모드 켜짐" }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator(".scene-legend")).toContainText(
		"타일 색·높이 = 기간 안 예보 순간 최대 중앙값 합",
	);
	await expect(page.locator(".scene-legend__data")).toContainText("예보 없음");
	await expect(page.locator(".scene-legend__data-row")).toHaveCount(6);
	await expect(page.locator(".scene-legend__data")).toContainText(
		"지금 필터 기준으로 다시 나눔",
	);
	await expect(page.locator("html")).not.toHaveAttribute("data-scene-trains");
	await expect(page).toHaveURL(/data=1/);
	await page.screenshot({ path: resolve(output, "T-433b-s1-data.png") });
});

// 노트북 크기의 판과 밤 노출을 서로 다른 캡처로 검토한다.
test("밤과 노트북 장면 캡처", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(
		`/?sceneFixture=1&view=miniature&theme=night&sceneDiagnostic=1&at=${encodeURIComponent("2025-10-18T21:00:00+09:00")}`,
	);
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{ timeout: 30_000 },
	);
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: resolve(output, "T-433-s1-night.png") });
	await page.setViewportSize({ width: 1280, height: 800 });
	await expect.poll(() => boardCornersAreSafe(page)).toBe(true);
	await page.screenshot({ path: resolve(output, "T-433b-s1-laptop.png") });
	const panelsOverlap = await page.evaluate(() => {
		const filter = document
			.querySelector(".scene-filter")
			?.getBoundingClientRect();
		const legend = document
			.querySelector(".scene-legend")
			?.getBoundingClientRect();
		return Boolean(filter && legend && filter.bottom > legend.top);
	});
	expect(panelsOverlap).toBe(false);
	await expect(
		page.getByRole("button", { name: "데이터 모드 꺼짐" }),
	).toBeVisible();
	await expect(
		page.locator(".scene-filter .festival-filters__actions"),
	).toBeInViewport();
});

// 실제 경로는 모의 API를 읽고 SVG 대체도 요약·상담 흐름을 공유한다.
test("실제 API와 SVG 선택 고지", async ({ page }) => {
	await page.route("**/api/festivals", async (route) =>
		route.fulfill({ json: [{ ...card, modelVerdict: undefined }] }),
	);
	await page.goto(`/?forceSvg=1&data=1&at=${time}`);
	await expect(page.locator(".festival-list__pick")).toHaveCount(1);
	await expect(page.locator(".scene-svg-notices")).not.toContainText(
		"비교 검증 사례가 아직 없어요",
	);
	await expect(page.locator(".scene-svg-notices")).toContainText(
		"작은 행사는 크게 예보될 수 있어요",
	);
	await expect(page.locator(".scene-svg-notices")).not.toContainText(
		"견본 데이터",
	);
	await expect(
		page.getByRole("button", { name: "데이터 모드 꺼짐" }),
	).toBeDisabled();
	await expect(page.locator(".scene-svg-notices")).toContainText(
		"SVG 지도에서는 데이터 모드를 사용할 수 없어요",
	);
	await page.locator(".svg-korea-map__event").click();
	await expect(
		page.getByRole("region", { name: "선택 행사 요약" }),
	).toContainText(card.name);
	await expect(page.locator(".festival-list__pick")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await page.locator(".svg-korea-map svg").click({ position: { x: 5, y: 5 } });
	await expect(page.locator(".festival-summary__empty")).toBeVisible();
	await page.locator(".svg-korea-map__event").click();
	await page.keyboard.press("Escape");
	await expect(page.locator(".festival-summary__empty")).toBeVisible();
});
