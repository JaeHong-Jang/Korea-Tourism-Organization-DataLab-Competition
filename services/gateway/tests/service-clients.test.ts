// 세 백엔드 클라이언트가 정상 계약을 보존하고 오류 픽스처를 거부하는지 검증한다
import { describe, expect, it, vi } from "vitest";
import { createForecastClient } from "../src/clients/forecast-client.js";
import { createKnowledgeClient } from "../src/clients/knowledge-client.js";
import { createRecordsClient } from "../src/clients/records-client.js";
import { eventFixture, readContractFixture } from "./contract-fixture.js";

// 서비스마다 실제 도메인 메서드로 검증 경로를 실행한다
const cases = [
  {
    name: "forecast",
    valid: "forecast/valid-yeongjong.json",
    invalid: [
      "forecast/invalid-mean-unit-won.json",
      "forecast/invalid-missing-unit.json",
      "forecast/invalid-peak-not-estimated.json",
      "forecast/invalid-peak-one-assumption.json",
      "forecast/invalid-sigungu-code.json",
    ],
    call: (fetcher: typeof fetch) =>
      createForecastClient({
        baseUrl: "http://127.0.0.1:8010",
        fetch: fetcher,
      }).predict(eventFixture()),
  },
  {
    name: "knowledge",
    valid: "evidence/valid-data.json",
    invalid: [
      "evidence/invalid-data-without-source.json",
      "evidence/invalid-data-without-period.json",
      "evidence/invalid-model-without-forecast.json",
    ],
    call: (fetcher: typeof fetch) =>
      createKnowledgeClient({
        baseUrl: "http://127.0.0.1:8020",
        fetch: fetcher,
      }).getEvidence("ev-yeongjong"),
  },
  {
    name: "records",
    valid: "forecast-report/valid-yeongjong.json",
    invalid: ["forecast-report/invalid-unpublished-claim.json"],
    call: (fetcher: typeof fetch) =>
      createRecordsClient({
        baseUrl: "http://127.0.0.1:8030",
        fetch: fetcher,
      }).getSnapshots("e-yeongjong"),
  },
];

// 읽기·배열·중첩 참조를 포함한 계약 검증이 모든 서비스에서 동작해야 한다
describe.each(cases)("$name 응답 검증", ({ name, valid, invalid, call }) => {
  // 정상 데이터의 숫자와 근거를 변경하지 않고 전달한다
  it("정상 픽스처를 그대로 반환한다", async () => {
    const fixture = readContractFixture(valid);
    const body = name === "records" ? [fixture] : fixture;
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
    expect(await call(fetcher)).toEqual(body);
  });

  // 계약 저장소의 반례를 재사용해 느슨한 응답 검증으로 퇴행하지 않게 한다
  it.each(invalid)("오류 픽스처 %s를 거부한다", async (path) => {
    const fixture = readContractFixture(path);
    const body = name === "records" ? [fixture] : fixture;
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
    await expect(call(fetcher)).rejects.toThrow("서비스 응답 계약 위반");
  });
});

// HTTP 메서드·경로·쿼리·본문이 백엔드 OpenAPI와 일치하는지 확인한다
describe("서비스 요청 구성", () => {
  // POST 요청에 행사 카드와 JSON 콘텐츠 형식을 전달한다
  it("예측 요청에 행사 JSON을 그대로 보낸다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(readContractFixture(cases[0].valid)),
    );
    await cases[0].call(fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/v1/predict",
      expect.objectContaining({
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(eventFixture()),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  // 검증 범위를 빠뜨리면 다른 revision에 대한 게이트를 신뢰할 수 없다
  it("knowledge 검증에 revision·masterVersion·shapes를 전달한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(readContractFixture("gate-report/valid-gate-a.json")),
    );
    const client = createKnowledgeClient({
      baseUrl: "http://127.0.0.1:8020/",
      fetch: fetcher,
    });
    await client.validateSession("s-yeongjong", 2, 1, "S01,S03");
    const [input, init] = fetcher.mock.calls[0];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/v1/sessions/s-yeongjong/validate");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      revision: "2",
      masterVersion: "1",
      shapes: "S01,S03",
    });
    expect(init?.method).toBe("POST");
  });

  // 목록 응답을 객체로 잘못 감싸거나 중첩 항목이 잘못되면 거부한다
  it("records 목록의 래퍼와 각 행사 항목을 검증한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ events: [eventFixture()] }))
      .mockResolvedValueOnce(
        Response.json([{ ...eventFixture(), startsAt: "잘못된 날짜" }]),
      )
      .mockResolvedValueOnce(Response.json([eventFixture()]));
    const client = createRecordsClient({
      baseUrl: "http://127.0.0.1:8030",
      fetch: fetcher,
    });
    await expect(client.listEvents()).rejects.toThrow("계약 위반");
    await expect(client.listEvents()).rejects.toThrow("계약 위반");
    expect(await client.listEvents()).toEqual([eventFixture()]);
  });

  // 경로 예약 문자는 근거 식별자의 일부로 보내야 한다
  it("근거 식별자의 예약 문자를 인코딩한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(readContractFixture("evidence/valid-data.json")),
    );
    await createKnowledgeClient({
      baseUrl: "http://127.0.0.1:8020",
      fetch: fetcher,
    }).getEvidence("ev-인천/영종?전회차");
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `http://127.0.0.1:8020/v1/evidence/${encodeURIComponent("ev-인천/영종?전회차")}`,
    );
  });
});
