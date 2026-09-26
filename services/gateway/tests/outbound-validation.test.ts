// 본문 계약을 어긴 호출이 실제 fetch보다 먼저 차단되는지 확인한다
import type { Event, ForecastReport } from "@crowdcast/contracts/types";
import { describe, expect, it, vi } from "vitest";
import { createForecastClient } from "../src/clients/forecast-client.js";
import { createKnowledgeClient } from "../src/clients/knowledge-client.js";
import { createRecordsClient } from "../src/clients/records-client.js";
import type { SessionFacts } from "../src/contract/session-facts.js";
import { eventFixture, readContractFixture } from "./contract-fixture.js";

// 타입 단언으로 들어온 외부 JSON도 런타임 검증을 우회하지 못한다
describe("발신 본문 검증", () => {
  // 요청 스키마가 요구하는 본문은 undefined라도 전송 전에 거부한다
  it.each(["predict", "similar"] as const)(
    "%s의 undefined 본문을 거부한다",
    async (method) => {
      const fetcher = vi.fn<typeof fetch>();
      const client = createForecastClient({
        baseUrl: "http://localhost:8010",
        fetch: fetcher,
      });
      await expect(
        client[method](undefined as unknown as Event),
      ).rejects.toThrow("서비스 요청 계약 위반");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each(["predict", "similar"] as const)(
    "forecast %s의 잘못된 행사를 전송하지 않는다",
    async (method) => {
      const fetcher = vi.fn<typeof fetch>();
      const client = createForecastClient({
        baseUrl: "http://localhost:8010",
        fetch: fetcher,
      });
      await expect(
        client[method]({ ...eventFixture(), sigunguCode: "인천" } as Event),
      ).rejects.toThrow("서비스 요청 계약 위반");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  // 본문 종류와 items의 스키마까지 검사한다
  it.each([
    { schema: "event", items: [] },
    {
      schema: "event",
      items: [readContractFixture("forecast/valid-yeongjong.json")],
    },
    { schema: "agent-step", items: [{}] },
  ])("knowledge 잘못된 facts를 전송하지 않는다", async (body) => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createKnowledgeClient({
      baseUrl: "http://localhost:8020",
      fetch: fetcher,
    });
    await expect(
      client.addFacts("s-yeongjong", body as SessionFacts),
    ).rejects.toThrow("서비스 요청 계약 위반");
    expect(fetcher).not.toHaveBeenCalled();
  });

  // 저장 전 검증은 행사와 발행 완료 예보서 모두에 적용한다
  it("records 행사와 미발행 문장이 든 스냅샷을 전송하지 않는다", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createRecordsClient({
      baseUrl: "http://localhost:8030",
      fetch: fetcher,
    });
    await expect(
      client.saveEvent({ ...eventFixture(), startsAt: "미정" }),
    ).rejects.toThrow("서비스 요청 계약 위반");
    await expect(
      client.saveSnapshot(
        "e-yeongjong",
        readContractFixture(
          "forecast-report/invalid-unpublished-claim.json",
        ) as ForecastReport,
      ),
    ).rejects.toThrow("서비스 요청 계약 위반");
    expect(fetcher).not.toHaveBeenCalled();
  });

  // 장소 검색도 서비스 응답 검증뿐 아니라 요청 본문을 검사한다
  it("geocode 문자열이 아닌 장소를 전송하지 않는다", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createForecastClient({
      baseUrl: "http://localhost:8010",
      fetch: fetcher,
    });
    await expect(client.geocode(null as unknown as string)).rejects.toThrow(
      "서비스 요청 계약 위반",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
