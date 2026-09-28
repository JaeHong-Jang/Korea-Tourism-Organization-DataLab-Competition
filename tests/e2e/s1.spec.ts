// S1 선택·상담 입력·지도 확대·고지를 실제 브라우저 화면에서 확인한다.

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
		"건물 자리·도로·녹지 = 실제 지도 자료",
	);
	await page.screenshot({ path: resolve(output, "T-435-s1-rain-night.png") });
});

// 움직임 줄이기에서도 행사를 고르면 같은 지도가 동네까지 확대되고, Esc로 선택이 풀린다.
test("고른 행사로 지도 확대와 선택 해제", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(
		`/?sceneFixture=1&view=miniature&theme=day&sceneDiagnostic=1&at=${time}`,
	);
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{ timeout: 30_000 },
	);
	await expect(page.locator(".scene-legend")).toContainText(
		"사람·차량은 보이게 키운 연출이며 실제 위치·교통량이 아니에요",
	);
	await page.screenshot({ path: resolve(output, "T-434a-s1-day.png") });
	await page.locator(".festival-list__pick").first().click();
	await expect
		.poll(
			async () =>
				Number(
					await page.locator("html").getAttribute("data-national-map-zoom"),
				),
			{ timeout: 60_000 },
		)
		.toBeGreaterThanOrEqual(13);
	await page.screenshot({ path: resolve(output, "T-434a-s1-selected.png") });
	await page.keyboard.press("Escape");
	await expect(
		page.locator(".scene-stage section[data-focus-id]"),
	).toHaveAttribute("data-focus-id", "");
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

// 진단용 OrbitControls 표적을 읽어 목록과 장면 키 입력을 구분한다.
async function cameraTarget(page: Page): Promise<number[] | null> {
	return page.evaluate(() => window.__crowdcastCameraTarget?.() ?? null);
}

// 견본 모드에서 목록 선택과 장면 이름표 선택은 하나의 행사 ID를 공유한다.
test("견본 선택, 해제, 상담 입력", async ({ page }) => {
	test.setTimeout(90_000);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 1440, height: 900 });
	// 전국 판의 카메라·이름표를 확인하므로 선택해도 동네 3D로 넘어가지 않게 한다.
	await page.goto(
		`/?sceneFixture=1&view=miniature&theme=day&sceneDiagnostic=1&sceneCity=0&at=${time}`,
	);
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
		.toBeGreaterThan(beforeSceneKey?.[0] ?? 0);

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
	await page.screenshot({ path: resolve(output, "T-433-s1-selected.png") });

	// 선택을 풀고 지도 위 행사 표식을 누르면 목록 선택과 같은 행사로 맞춰진다.
	await page.keyboard.press("Escape");
	await expect(
		page.locator(".scene-stage section[data-focus-id]"),
	).toHaveAttribute("data-focus-id", "");
	const pin = page.locator(".map-festival-pin:visible").first();
	await expect(pin).toBeVisible();
	const pinId = (await pin.getAttribute("data-festival-id")) ?? "";
	await pin.click();
	await expect(
		page.locator(".scene-stage section[data-focus-id]"),
	).toHaveAttribute("data-focus-id", pinId);
	await expect(
		page.locator(".festival-list__items li.is-selected"),
	).toBeInViewport();
	await page.keyboard.press("Escape");
	await expect(
		page.locator(".scene-stage section[data-focus-id]"),
	).toHaveAttribute("data-focus-id", "");
	// 선택을 풀면 고래 말풍선의 행사 카드도 내려간다.
	await expect(
		page.getByRole("region", { name: "선택 행사 요약" }),
	).toHaveCount(0);

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
	await expect(
		page.getByRole("complementary", { name: "고래 봇 대화" }),
	).toBeVisible();
	await expect(page).toHaveURL(/\/(\?|$)/);
	await expect.poll(() => sessions.length).toBeGreaterThan(0);
	await page.getByRole("button", { name: "대화 닫기" }).click();
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
	// 필터는 오른쪽 패널의 "필터" 탭에서 적용 개수·초기화까지 한 화면에 보인다.
	await page.getByRole("tab", { name: "필터" }).click();
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
	await expect(page.locator(".scene-svg-notices")).toContainText(
		"이 기기에서는 간단한 지도로 보여 드려요",
	);
	await expect(page.locator(".scene-honest-notices")).not.toContainText(
		"비교 검증 사례가 아직 없어요",
	);
	await expect(page.locator(".scene-honest-notices")).toContainText(
		"작은 행사는 크게 예보될 수 있어요",
	);
	await expect(page.locator(".scene-honest-notices")).not.toContainText(
		"견본 데이터",
	);
	// 간단 지도에는 지도 도구(데이터 모드)가 없고 주소의 data=1도 범례에 쓰지 않는다.
	await expect(page.getByRole("button", { name: "데이터 모드" })).toHaveCount(
		0,
	);
	await expect(page.locator(".scene-legend__data")).toHaveCount(0);
	await page.locator(".svg-korea-map__event").click();
	await expect(
		page.getByRole("region", { name: "선택 행사 요약" }),
	).toContainText(card.name);
	await expect(page.locator(".festival-list__pick")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await page.locator(".svg-korea-map svg").click({ position: { x: 5, y: 5 } });
	await expect(
		page.getByRole("region", { name: "선택 행사 요약" }),
	).toHaveCount(0);
	await page.locator(".svg-korea-map__event").click();
	await page.keyboard.press("Escape");
	await expect(
		page.getByRole("region", { name: "선택 행사 요약" }),
	).toHaveCount(0);
});
