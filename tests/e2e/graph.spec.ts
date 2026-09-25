// 가짜 계약 API로 전체 근거 그래프의 필터·검색·상세·표를 확인한다.
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const screens = resolve(process.cwd(), "../../reports/figures/screens");
const graph = {
	masterVersion: 7,
	generatedAt: "2026-09-25T12:00:00Z",
	nodes: [
		{ id: "cc:Evidence", kind: "class", label: "근거" },
		{
			id: "rule-safety",
			kind: "rule",
			label: "행사 안전 판정 규칙",
			note: "행사장의 위험을 판정하는 규칙",
		},
		{
			id: "law-safety",
			kind: "clause",
			label: "재난 및 안전관리 기본법 조항",
			note: "안전관리계획 근거",
			url: "https://www.law.go.kr/",
		},
		{
			id: "ds-visit",
			kind: "dataset",
			label: "한국관광 데이터랩 방문자",
			note: "지역별 방문자 통계",
			url: "https://datalab.visitkorea.or.kr/",
		},
		{ id: "as-weather", kind: "assumption", label: "우천 가정" },
	],
	edges: [
		{
			source: "cc:Evidence",
			target: "rule-safety",
			predicate: "rdfs:subClassOf",
			label: "분류한다",
		},
		{
			source: "rule-safety",
			target: "law-safety",
			predicate: "cc:basedOn",
			label: "근거로 삼는다",
		},
		{
			source: "rule-safety",
			target: "ds-visit",
			predicate: "prov:used",
			label: "사용한다",
		},
	],
};

// 숨겨진 종류를 검색으로 열고 원문과 표에서도 같은 계약 값을 찾는다.
test("전체 근거 그래프를 탐색한다", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.route("**/api/evidence/graph", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(graph),
		}),
	);
	await page.goto("/validation");
	await page.getByRole("link", { name: "근거 그래프" }).click();
	await expect(
		page.getByRole("heading", { name: "근거 그래프" }),
	).toBeVisible();
	await expect(
		page.getByRole("region", { name: "온톨로지와 기준 그래프" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "규칙: 행사 안전 판정 규칙" }),
	).toBeVisible();
	await expect(page.locator(".react-flow__edge").first()).toBeVisible();
	await expect(
		page.getByRole("button", { name: "가정", exact: true }),
	).toHaveAttribute("aria-pressed", "false");
	await page.screenshot({ path: resolve(screens, "T-444-graph.png") });

	// 종류 버튼으로 가정을 켜고 검색 결과에서 데이터셋으로 이동한다.
	await page.getByRole("button", { name: "가정", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "가정", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("searchbox", { name: "노드 검색" }).fill("관광");
	await page
		.getByRole("button", { name: "데이터셋 · 한국관광 데이터랩 방문자" })
		.click();
	await expect(
		page.getByRole("complementary", { name: "노드 상세" }),
	).toContainText("지역별 방문자 통계");
	await expect(
		page
			.getByRole("complementary", { name: "노드 상세" })
			.getByRole("link", { name: "원문 열기" }),
	).toHaveAttribute("href", "https://datalab.visitkorea.or.kr/");
	await page.screenshot({ path: resolve(screens, "T-444-detail.png") });

	// 표는 관계 이름과 원문 링크를 동일하게 보존한다.
	await page.getByRole("button", { name: "표로 보기" }).click();
	await expect(
		page.getByRole("table", { name: "기준 그래프의 노드와 연결 관계" }),
	).toContainText("근거로 삼는다");
	await expect(
		page
			.getByRole("table", { name: "기준 그래프의 노드와 연결 관계" })
			.getByRole("link", { name: "원문 열기" })
			.first(),
	).toHaveAttribute("href", "https://www.law.go.kr/");
});
