// 사용자가 준 고래 봇과 실제 SSE 진행 화면을 브라우저에서 검증한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import { expect, test } from "@playwright/test";

const root = resolve(process.cwd(), "../..");
const screenshots = resolve(root, "reports/figures/screens");
const forecast = JSON.parse(
	readFileSync(
		resolve(root, "packages/contracts/fixtures-sse/valid-new-forecast.json"),
		"utf8",
	),
) as SseEvent[];
const reply = {
	event: "reply",
	seq: forecast.length - 1,
	data: {
		text: "예보서를 살펴보고 필요한 준비를 확인해 주세요.",
		source: "template",
	},
} as SseEvent;
const done = forecast.at(-1);
if (!done) throw new Error("예보 픽스처에 완료 이벤트가 없어요.");
const streamed = [
	...forecast.slice(0, -1),
	reply,
	{ ...done, seq: forecast.length },
];

// 다섯 안내 단계와 이동 위치가 화면 전환·새로고침 뒤에도 유지된다.
test("고래 끌기와 키보드 이동, 사용법 단계", async ({ page }) => {
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto("/?sceneFixture=1");
	const whale = page.getByRole("button", { name: "고래 봇 대화 열기" });
	await expect(whale.locator('img[src="/assistant/whale.png"]')).toBeVisible();
	await page.screenshot({ path: resolve(screenshots, "T-446-bot.png") });
	await page.getByRole("button", { name: "사용법 +" }).click();
	const guide = page.getByRole("dialog", { name: "인파예보 사용법" });
	await expect(guide).toContainText("지도에서 행사 보기");
	await expect(page.locator(".assistant-guide__target")).toBeVisible();
	await page.screenshot({ path: resolve(screenshots, "T-446-guide.png") });
	await guide.getByRole("button", { name: "다음" }).click();
	await expect(guide).toContainText("목록에서 행사 고르기");
	await guide.getByRole("button", { name: "다음" }).click();
	await expect(guide).toContainText("예보 받기");
	await expect(page).toHaveURL(/\/consult/);
	await guide.getByRole("button", { name: "다음" }).click();
	await expect(guide).toContainText("고래와 대화하기");
	await guide.getByRole("button", { name: "다음" }).click();
	await expect(guide).toContainText("근거 그래프 보기");
	await expect(
		page
			.getByRole("navigation", { name: "주 메뉴" })
			.getByRole("link", { name: "근거 그래프" }),
	).toBeVisible();
	await guide.getByRole("button", { name: "마치기" }).click();

	// 그림 안에서 드래그한 뒤 대화 서랍이 열리지 않고 위치가 저장된다.
	const before = await whale.boundingBox();
	if (!before) throw new Error("고래 버튼의 위치를 읽지 못했어요.");
	await page.mouse.move(before.x + 35, before.y + 35);
	await page.mouse.down();
	await page.mouse.move(before.x - 105, before.y - 125, { steps: 8 });
	await page.mouse.up();
	const moved = await whale.boundingBox();
	if (!moved) throw new Error("이동한 고래 위치를 읽지 못했어요.");
	expect(moved.x).toBeLessThan(before.x - 80);
	await expect(
		page.getByRole("complementary", { name: "고래 봇 대화" }),
	).toHaveCount(0);
	const saved = await page.evaluate(() =>
		window.localStorage.getItem("crowdcast:assistant:position"),
	);
	expect(saved).not.toBeNull();
	await page.reload();
	await expect(page.getByRole("button", { name: "사용법 +" })).toHaveCount(0);
	const restored = await whale.boundingBox();
	if (!restored) throw new Error("복원한 고래 위치를 읽지 못했어요.");
	expect(Math.abs(restored.x - moved.x)).toBeLessThan(2);
	await whale.focus();
	await page.keyboard.press("Alt+ArrowLeft");
	const keyed = await whale.boundingBox();
	if (!keyed) throw new Error("키보드 이동 위치를 읽지 못했어요.");
	expect(keyed.x).toBeLessThan(restored.x);
});

// 응답 프레임을 시간차로 흘려 가짜 단계 없이 작업 줄에서 예보 요약으로 바뀌는지 확인한다.
test("실시간 작업 줄과 발행 카드, 팀장 답", async ({ page }) => {
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.addInitScript(
		({ events }) => {
			const original = window.fetch.bind(window);
			const frame = (event: SseEvent) =>
				`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`;
			window.fetch = (input, init) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (url === "/api/team/sessions")
					return Promise.resolve(
						new Response(JSON.stringify({ sessionId: "s-demo-0001" }), {
							status: 200,
							headers: { "Content-Type": "application/json" },
						}),
					);
				if (url.includes("/api/team/sessions/") && url.endsWith("/messages")) {
					const stream = new ReadableStream<Uint8Array>({
						start(controller) {
							const encoder = new TextEncoder();
							controller.enqueue(encoder.encode(frame(events[0])));
							window.setTimeout(() => {
								for (const event of events.slice(1))
									controller.enqueue(encoder.encode(frame(event)));
								controller.close();
							}, 900);
						},
					});
					return Promise.resolve(
						new Response(stream, {
							status: 200,
							headers: { "Content-Type": "text/event-stream" },
						}),
					);
				}
				return original(input, init);
			};
		},
		{ events: streamed },
	);
	await page.goto("/consult");
	await page
		.getByLabel("행사를 설명해 주세요")
		.fill("영종 씨사이드파크 불꽃축제 예보해 줘");
	await page.getByRole("button", { name: "보내기" }).click();
	await expect(page.locator(".consult-work__current")).toContainText(
		"팀장 · 요청을 나눠 맡겼어요",
	);
	await page.screenshot({
		path: resolve(screenshots, "T-446-chat-working.png"),
	});
	await expect(page.getByRole("region", { name: "예보 요약" })).toContainText(
		"2.1만 명",
	);
	await expect(page.getByRole("region", { name: "예보 요약" })).toContainText(
		"19:00~21:00",
	);
	await expect(
		page.getByText("예보서를 살펴보고 필요한 준비를 확인해 주세요."),
	).toBeVisible();
	await expect(page.locator(".consult-bubble__evidence")).toHaveCount(0);
	await page.screenshot({ path: resolve(screenshots, "T-446-chat-done.png") });
	await page.getByRole("button", { name: "대화 닫기" }).click();
	const rows = page.locator(".team-board .team-group");
	await expect(rows).toHaveCount(4);
	await expect(rows.nth(0)).toContainText("팀장");
	await expect(rows.nth(1)).toContainText("분석팀");
	await expect(rows.nth(2)).toContainText("검증팀");
	await expect(rows.nth(3)).toContainText("보고팀");
	const board = await page.locator(".team-board").boundingBox();
	const preview = await page.locator(".report-preview").boundingBox();
	if (!board || !preview)
		throw new Error("작업판 또는 미리보기의 크기를 읽지 못했어요.");
	expect(Math.abs(board.height - preview.height)).toBeLessThan(2);
	await page.screenshot({
		path: resolve(screenshots, "T-446-board.png"),
		fullPage: true,
	});
});
