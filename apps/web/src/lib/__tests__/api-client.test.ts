// 게이트웨이 응답이 계약과 다를 때 화면에 잘못된 수치가 전달되지 않게 한다.

import { afterEach, describe, expect, it, vi } from "vitest";
import festivalFixture from "../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import reportFixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { getFestivals, getForecastReport } from "../api-client";

// 네트워크 대신 계약 견본 응답을 주고 형식 검증 결과를 확인한다.
function reply(data: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })),
  );
}

describe("API 계약 검증", () => {
  afterEach(() => vi.unstubAllGlobals());

  // 올바른 목록과 발행 예보서는 계약의 값을 변경하지 않는다.
  it("유효한 응답을 전달한다", async () => {
    reply([festivalFixture]);
    await expect(getFestivals()).resolves.toMatchObject([festivalFixture]);
    reply(reportFixture);
    await expect(
      getForecastReport(reportFixture.forecastId),
    ).resolves.toMatchObject(reportFixture);
  });

  // 항목 하나가 불일치해도 전체 목록을 오류로 돌린다.
  it("행사 목록의 잘못된 필드를 거부한다", async () => {
    reply([{ ...festivalFixture, peakP50: "21000" }]);
    await expect(getFestivals()).rejects.toThrow("API 계약 불일치");
  });

  // 발행 예보서의 필수 근거가 빠지면 숫자를 화면에 노출하지 않는다.
  it("예보서의 누락된 근거를 거부한다", async () => {
    const { evidence: _evidence, ...invalid } = reportFixture;
    reply(invalid);
    await expect(getForecastReport(reportFixture.forecastId)).rejects.toThrow(
      "API 계약 불일치",
    );
  });
});
