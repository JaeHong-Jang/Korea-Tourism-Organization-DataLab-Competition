// 새 상담 화면에서 열린 고래 패널의 입력칸으로 행사 설명을 보낸다.
import { expect, type Page } from "@playwright/test";

// 예보 결과는 본문에, 대화와 전송은 패널에 놓인 흐름을 공통으로 따른다.
export async function sendConsultDescription(page: Page, description: string) {
	const panel = page.getByRole("complementary", { name: "고래 봇 대화" });
	await expect(panel).toBeVisible();
	await panel
		.getByRole("textbox", { name: "행사를 설명해 주세요" })
		.fill(description);
	await panel.getByRole("button", { name: "보내기" }).click();
}
