// 상담과 예보서가 자리표시자 숫자만 쉼표로 표시하는지 확인한다.
import type { Claim } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { renderClaim } from "../render-claim";

const claim = {
  text: "2025년 순간 최대 {{peak}}명, 10월 18일 21시",
  rendered: "2025년 순간 최대 21000명, 10월 18일 21시",
  placeholders: [{ name: "peak", quantityId: "q-peak", field: "p50" }],
} as Claim;

// 일반 문장 숫자는 바꾸지 않고 검증된 수치 칸만 바꾼다.
it("자리표시자의 수치에만 쉼표를 더한다", () => {
  expect(renderClaim(claim)).toBe("2025년 순간 최대 21,000명, 10월 18일 21시");
  expect(renderClaim(claim, [{ id: "q-peak", p50: 21000 }])).toBe(
    "2025년 순간 최대 21,000명, 10월 18일 21시",
  );
  expect(renderClaim({ ...claim, placeholders: [] })).toBe(claim.rendered);
});
