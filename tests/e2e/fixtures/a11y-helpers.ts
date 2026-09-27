// 접근성 검사에 필요한 API 견본과 화면 폭 검사 함수를 제공한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { backtest } from "../../../apps/web/src/features/validation/__tests__/validation-fixtures";
import { planFixture } from "./plan-yeongjong";

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
export const savedEvent = JSON.parse(
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
export async function routeFixtures(page: Page) {
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
export async function checkAxe(page: Page) {
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
export async function checkWidths(page: Page, name: string, task = "T-411a") {
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
export async function routeSavedReport(page: Page) {
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
