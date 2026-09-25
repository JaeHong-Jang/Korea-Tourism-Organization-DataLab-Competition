// 상담부터 운영까지 접근성과 네 화면 폭의 가로 넘침을 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { backtest } from "../../apps/web/src/features/validation/__tests__/validation-fixtures";
import { planFixture } from "./fixtures/plan-yeongjong";
import { sendConsultDescription } from "./fixtures/start-consult";

const root = resolve(process.cwd(), "../../");
const screens = resolve(root, "reports/figures/screens");
const report = JSON.parse(
	readFileSync(
		resolve(
			root,
			"packages/contracts/fixtures/forecast-report/valid-yeongjong.json",
		),
		"utf8",
	),
);
const savedEvent = JSON.parse(
	readFileSync(
		resolve(root, "packages/contracts/fixtures/event/valid-yeongjong.json"),
		"utf8",
	),
);
const run = JSON.parse(
	readFileSync(
		resolve(
			root,
			"packages/contracts/fixtures/pipeline-run/valid-running.json",
		),
		"utf8",
	),
);
const ops = JSON.parse(
	readFileSync(
		resolve(root, "packages/contracts/fixtures/ops-status/valid-example.json"),
		"utf8",
	),
);
const consultation = JSON.parse(
	readFileSync(
		resolve(root, "packages/contracts/fixtures-sse/valid-new-forecast.json"),
		"utf8",
	),
) as { event: string; data: unknown }[];
const usage = JSON.parse(
	readFileSync(
		resolve(
			root,
			"packages/contracts/fixtures/datalab-usage/valid-example.json",
		),
		"utf8",
	),
);
const model = JSON.parse(
	readFileSync(
		resolve(root, "packages/contracts/fixtures/model-card/valid-v0-1-0.json"),
		"utf8",
	),
);
const spec = JSON.parse(
	readFileSync(
		resolve(
			root,
			"packages/contracts/fixtures/datalab-spec/valid-example.json",
		),
		"utf8",
	),
);
const widths = [
	{ width: 1440, height: 900, label: "1440" },
	{ width: 1280, height: 800, label: "1280" },
	{ width: 768, height: 1024, label: "768" },
	{ width: 390, height: 844, label: "390" },
];

// 계약 견본으로 각 화면을 네트워크 없이 안정적으로 연다.
async function routeFixtures(page: Page) {
	await page.route("**/api/**", (route) =>
		route.fulfill({ status: 503, json: {} }),
	);
	await page.route("**/api/team/sessions", (route) =>
		route.fulfill({ json: { sessionId: "s-a11y" } }),
	);
	await page.route("**/api/team/sessions/*/steps", (route) =>
		route.fulfill({ json: [] }),
	);
	await page.route("**/api/team/sessions/*/messages", (route) =>
		route.fulfill({
			contentType: "text/event-stream",
			body: consultation
				.map(
					(item) => `event: ${item.event}\ndata: ${JSON.stringify(item)}\n\n`,
				)
				.join(""),
		}),
	);
	await page.route("**/api/forecasts/f-yeongjong-2025/plan", (route) =>
		route.fulfill({
			json: {
				plan: planFixture,
				docxHref: "/api/plans/plan-yeongjong-example/export.docx",
			},
		}),
	);
	await page.route("**/api/forecasts/f-yeongjong-2025", (route) =>
		route.fulfill({ json: report }),
	);
	await page.route("**/api/plans/plan-yeongjong-example", (route) =>
		route.fulfill({ json: planFixture }),
	);
	await page.route("**/api/ops/runs", (route) =>
		route.fulfill({ json: [run] }),
	);
	await page.route("**/api/ops/status", (route) =>
		route.fulfill({ json: ops }),
	);
	await page.route("**/api/validation/backtest", (route) =>
		route.fulfill({ json: backtest }),
	);
	await page.route("**/api/validation/model-card", (route) =>
		route.fulfill({ json: model }),
	);
	await page.route("**/api/evidence/stats", (route) =>
		route.fulfill({ json: usage }),
	);
	await page.route("**/api/insights/datalab-spec", (route) =>
		route.fulfill({ json: spec }),
	);
}

// 심각하거나 치명적인 위반의 위치를 실패 메시지에 남긴다.
async function checkAxe(page: Page) {
	const result = await new AxeBuilder({ page }).analyze();
	const severe = result.violations.filter((item) =>
		["serious", "critical"].includes(item.impact ?? ""),
	);
	expect(
		severe.map((item) => ({
			rule: item.id,
			nodes: item.nodes.map((node) => node.target),
		})),
	).toEqual([]);
}

// 각 폭에서 문서 전체가 뷰포트 밖으로 밀리지 않는지 확인한다.
async function checkWidths(page: Page, name: string, task = "T-411a") {
	for (const { width, height, label } of widths) {
		await page.setViewportSize({ width, height });
		await page.evaluate(() => document.fonts.ready);
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
			.toBeLessThanOrEqual(width);
		if (label === "1440" || label === "390")
			await page.screenshot({
				path: resolve(screens, `${task}-${name}-${label}.png`),
				fullPage: true,
			});
	}
}

// 저장 행사와 공유 예보는 같은 발행 견본을 읽기 전용으로 사용한다.
async function routeSavedReport(page: Page) {
	await page.route("**/api/records/events", (route) =>
		route.fulfill({ json: [savedEvent] }),
	);
	await page.route("**/api/records/events/*/snapshots", (route) =>
		route.fulfill({ json: [report] }),
	);
	await page.route("**/api/records/shares/*", (route) =>
		route.fulfill({ json: report }),
	);
}

// 3D·2D·간단 지도에서 보기 전환과 작은 화면 패널을 키보드로 사용할 수 있다.
for (const [name, query] of [
	["s1", "sceneFixture=1"],
	["s1-2d", "sceneFixture=1&view=top"],
	["s1-svg", "sceneFixture=1&forceSvg=1"],
] as const) {
	test(`S1 ${name} 접근성과 폭`, async ({ page }) => {
		// 3D 장면(소프트웨어 렌더러)에 네 폭 axe 분석이 겹쳐 전체 실행 부하에서는 30초를 넘길 수 있다
		test.setTimeout(60_000);
		await routeFixtures(page);
		await page.goto(`/?${query}&theme=day`);
		if (name !== "s1-svg")
			await expect(page.locator(".map-2d__hint")).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "대한민국 행사 지도" }),
		).toBeVisible();
		await checkAxe(page);
		await page.setViewportSize({ width: 390, height: 844 });
		const tabs = page.getByRole("navigation", { name: "미니 대한민국 정보" });
		const listTab = tabs.getByRole("button", { name: "행사 목록" });
		await listTab.focus();
		await page.keyboard.press("Enter");
		await expect(listTab).toHaveAttribute("aria-pressed", "true");
		await expect(page.locator(".scene-list")).toBeVisible();
		await tabs.getByRole("button", { name: "행사 현황" }).click();
		await page.getByText("주간 타임라인 펼치기").click();
		const startWeek = page.getByRole("slider", { name: "기간 시작 주" });
		if (await startWeek.count()) {
			await startWeek.focus();
			await page.keyboard.press("ArrowRight");
			await expect(startWeek).toBeFocused();
		}
		await tabs.getByRole("button", { name: "범례" }).click();
		await expect(page.locator(".scene-legend-panel")).toBeVisible();
		await checkAxe(page);
		if (name !== "s1-svg") {
			await tabs.getByRole("button", { name: "필터" }).click();
			await checkWidths(page, name, "T-411b");
		} else {
			await checkWidths(page, name, "T-411b");
		}
	});
}

// 내 행사 표의 선택과 공유 문서의 근거가 키보드에서 읽히는지 확인한다.
test("S5와 공유 예보서 접근성과 폭", async ({ page }) => {
	await routeFixtures(page);
	await routeSavedReport(page);
	await page.goto("/my?theme=day");
	const eventButton = page.getByRole("button", { name: savedEvent.name });
	await expect(eventButton).toBeVisible();
	await eventButton.focus();
	await page.keyboard.press("Enter");
	await expect(eventButton).toHaveAttribute("aria-pressed", "true");
	await checkAxe(page);
	await checkWidths(page, "s5", "T-411b");
	await expect
		.poll(() =>
			page
				.locator(".my-events-table-wrap")
				.evaluate((item) => item.scrollWidth),
		)
		.toBeLessThanOrEqual(
			await page
				.locator(".my-events-table-wrap")
				.evaluate((item) => item.clientWidth),
		);
	await page.goto("/s/sh-yeongjong2025abcd?theme=day");
	await expect(
		page.getByRole("heading", { name: "공유된 예보서" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "발행 예보서" }),
	).toBeVisible();
	await checkAxe(page);
	await checkWidths(page, "shared", "T-411b");
});

// 상담 시작과 응답 완료에서 이름·대비·탐색 구조를 함께 검사한다.
test("S2 상담 시작과 완료", async ({ page }) => {
	await routeFixtures(page);
	await page.goto("/consult?theme=day");
	await checkAxe(page);
	await sendConsultDescription(
		page,
		"10월 18일 19시부터 21시까지 영종 씨사이드파크에서 인천 중구가 여는 불꽃축제를 해요",
	);
	await expect(page.locator(".key-number strong").first()).toBeVisible();
	const member = page.getByRole("button", { name: "받아쓰기 작업 기록 열기" });
	await member.click();
	await expect(
		page.getByRole("dialog", { name: "팀원 작업 기록" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(member).toBeFocused();
	await checkAxe(page);
	await checkWidths(page, "s2");
});

// 예보서 탭 세 개와 계획 초안의 목차를 실제 견본으로 연다.
test("S3 세 탭과 S4 계획 초안", async ({ page }) => {
	await routeFixtures(page);
	await page.goto("/f/f-yeongjong-2025?theme=day");
	await expect(page.getByRole("tab", { name: "예보서" })).toBeVisible();
	await page.getByRole("tab", { name: "예보서" }).focus();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("tab", { name: "근거 지도" })).toBeFocused();
	await page.keyboard.press("Home");
	await expect(page.getByRole("tab", { name: "예보서" })).toBeFocused();
	const chip = page.locator('a[href^="#evidence-"]').first();
	await chip.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("dialog", { name: "근거 서랍" })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(chip).toBeFocused();
	for (const tab of ["예보서", "근거 지도", "행사장 3D"]) {
		await page.getByRole("tab", { name: tab }).click();
		if (tab === "근거 지도") {
			const filters = page
				.getByRole("group", { name: "근거 종류 필터" })
				.getByRole("button");
			await filters.first().focus();
			await page.keyboard.press("ArrowRight");
			await expect(filters.nth(1)).toBeFocused();
			await page.keyboard.press("Space");
			await expect(filters.nth(1)).toHaveAttribute("aria-pressed", "true");
		}
		await checkAxe(page);
		if (tab === "예보서") await checkWidths(page, "s3");
	}
	await page.goto("/f/f-yeongjong-2025/plan?theme=day");
	await expect(
		page.getByRole("navigation", { name: "계획 초안 목차" }),
	).toBeVisible();
	const contents = page
		.getByRole("navigation", { name: "계획 초안 목차" })
		.getByRole("button");
	await contents.first().focus();
	await page.keyboard.press("ArrowDown");
	await expect(contents.nth(1)).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.locator("#plan-heading-organization")).toBeFocused();
	await checkAxe(page);
	await checkWidths(page, "s4");
});

// 검증·인사이트·운영은 빈 자료와 운영 견본 상태에서도 끝까지 읽힌다.
for (const [name, path] of [
	["s6", "/validation"],
	["s7", "/insights"],
	["s8", "/ops"],
] as const) {
	test(`S6~S8 ${name} 접근성과 폭`, async ({ page }) => {
		await routeFixtures(page);
		await page.goto(`${path}?theme=day`);
		await expect(page.getByRole("main")).toBeVisible();
		if (name === "s8") {
			const details = page.getByText("단계 펼치기").first();
			await details.focus();
			await page.keyboard.press("Enter");
			await expect(page.locator(".ops-stage").first()).toBeVisible();
		}
		await checkAxe(page);
		await checkWidths(page, name);
	});
}

// 감소 설정에서는 버튼과 패널의 장식 전환을 모두 중지한다.
test("감소 모션 설정", async ({ page }) => {
	await routeFixtures(page);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/f/f-yeongjong-2025?theme=day");
	const duration = await page
		.getByRole("button", { name: "인쇄" })
		.evaluate((item) => getComputedStyle(item).transitionDuration);
	expect(duration.split(",").every((value) => value.trim() === "0s")).toBe(
		true,
	);
});
