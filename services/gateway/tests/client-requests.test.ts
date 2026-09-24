// 각 공개 클라이언트 함수의 메서드·쿼리·본문을 OpenAPI 요청 정의와 대조한다
import { describe, expect, it, vi } from "vitest";
import { createForecastClient } from "../src/clients/forecast-client.js";
import { createKnowledgeClient } from "../src/clients/knowledge-client.js";
import { createRecordsClient } from "../src/clients/records-client.js";
import { responseSchema } from "../src/contract/responses.js";
import { eventFixture, readContractFixture } from "./contract-fixture.js";

// 서비스의 서로 다른 주소와 끝 슬래시 정규화도 함께 확인한다
const addresses = {
  forecast: "http://127.0.0.1:8010",
  knowledge: "http://127.0.0.1:8020",
  records: "http://127.0.0.1:8030",
};

// 모든 호출을 실제 네트워크 대신 요청 기록용 fetch로 보낸다
function createClients(fetcher: typeof fetch) {
  return {
    forecast: createForecastClient({
      baseUrl: `${addresses.forecast}/`,
      fetch: fetcher,
    }),
    knowledge: createKnowledgeClient({
      baseUrl: `${addresses.knowledge}/`,
      fetch: fetcher,
    }),
    records: createRecordsClient({
      baseUrl: `${addresses.records}/`,
      fetch: fetcher,
    }),
  };
}
type Clients = ReturnType<typeof createClients>;

// 입력 예보서는 타입 단언 없이 계약의 발행 완료 픽스처로 준비한다
const report = readContractFixture("forecast-report/valid-yeongjong.json");
const validateReport = responseSchema("forecast-report");
if (!validateReport(report))
  throw new Error("예보서 픽스처가 계약에 맞지 않습니다");
const event = eventFixture();
const evidence = readContractFixture("evidence/valid-data.json");
const gate = readContractFixture("gate-report/valid-gate-a.json");
const at = "2026-09-24T18:00:00+09:00";

// 기준값은 openapi/forecast.yaml·knowledge.yaml·records.yaml의 각 연산에 따른다
const requests: {
  service: keyof Clients;
  name: string;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  response: unknown;
  call: (clients: Clients) => Promise<unknown>;
}[] = [
  {
    service: "forecast",
    name: "predict",
    method: "POST",
    path: "/v1/predict",
    body: event,
    response: readContractFixture("forecast/valid-yeongjong.json"),
    call: ({ forecast }) => forecast.predict(event),
  },
  {
    service: "forecast",
    name: "similar",
    method: "POST",
    path: "/v1/similar",
    body: event,
    response: [readContractFixture("similar-event/valid-yeongjong-2024.json")],
    call: ({ forecast }) => forecast.similar(event),
  },
  {
    service: "forecast",
    name: "baseline",
    method: "GET",
    path: "/v1/baseline",
    query: { sigunguCode: "28110", before: "2026-09-24" },
    response: readContractFixture("region-baseline/valid-28110.json"),
    call: ({ forecast }) => forecast.baseline("28110", "2026-09-24"),
  },
  {
    service: "forecast",
    name: "weather",
    method: "GET",
    path: "/v1/weather",
    query: { lat: "37.48", lng: "126.58", at },
    response: {
      lat: 37.48,
      lng: 126.58,
      at,
      sky: null,
      pty: null,
      temp: null,
      pop: null,
      source: "없음",
      fetchedAt: null,
    },
    call: ({ forecast }) => forecast.weather(37.48, 126.58, at),
  },
  {
    service: "knowledge",
    name: "getEvidence",
    method: "GET",
    path: "/v1/evidence/ev-yeongjong",
    response: evidence,
    call: ({ knowledge }) => knowledge.getEvidence("ev-yeongjong"),
  },
  {
    service: "knowledge",
    name: "getClaimEvidence",
    method: "GET",
    path: "/v1/claims/c-yeongjong/evidence",
    response: [evidence],
    call: ({ knowledge }) => knowledge.getClaimEvidence("c-yeongjong"),
  },
  {
    service: "knowledge",
    name: "addFacts",
    method: "POST",
    path: "/v1/sessions/s-yeongjong/facts",
    body: { schema: "event", items: [event] },
    response: { revision: 3 },
    call: ({ knowledge }) =>
      knowledge.addFacts("s-yeongjong", { schema: "event", items: [event] }),
  },
  {
    service: "knowledge",
    name: "validateSession",
    method: "POST",
    path: "/v1/sessions/s-yeongjong/validate",
    query: { revision: "2", masterVersion: "1", shapes: "S01,S03" },
    response: gate,
    call: ({ knowledge }) =>
      knowledge.validateSession("s-yeongjong", 2, 1, "S01,S03"),
  },
  {
    service: "knowledge",
    name: "publishSession",
    method: "POST",
    path: "/v1/sessions/s-yeongjong/publish",
    query: { revision: "2", masterVersion: "1" },
    response: gate,
    call: ({ knowledge }) => knowledge.publishSession("s-yeongjong", 2, 1),
  },
  {
    service: "records",
    name: "listEvents",
    method: "GET",
    path: "/v1/events",
    response: [event],
    call: ({ records }) => records.listEvents(),
  },
  {
    service: "records",
    name: "getEvent",
    method: "GET",
    path: "/v1/events/e-yeongjong",
    response: event,
    call: ({ records }) => records.getEvent("e-yeongjong"),
  },
  {
    service: "records",
    name: "saveEvent",
    method: "POST",
    path: "/v1/events",
    body: event,
    response: event,
    call: ({ records }) => records.saveEvent(event),
  },
  {
    service: "records",
    name: "getSnapshots",
    method: "GET",
    path: "/v1/events/e-yeongjong/snapshots",
    response: [report],
    call: ({ records }) => records.getSnapshots("e-yeongjong"),
  },
  {
    service: "records",
    name: "saveSnapshot",
    method: "POST",
    path: "/v1/events/e-yeongjong/snapshots",
    body: report,
    response: report,
    call: ({ records }) => records.saveSnapshot("e-yeongjong", report),
  },
];

// 본문 없는 POST와 GET에는 content-type도 추가하지 않아 계약 밖 JSON을 피한다
describe("OpenAPI 요청 구성", () => {
  // 클라이언트 전체를 같은 검증으로 확인해 메서드·본문 추론이 다시 생기는 것을 막는다
  it.each(requests)("$service.$name", async (spec) => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(spec.response),
    );
    expect(await spec.call(createClients(fetcher))).toEqual(spec.response);
    expect(fetcher).toHaveBeenCalledOnce();
    const [input, init] = fetcher.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin).toBe(addresses[spec.service]);
    expect(url.pathname).toBe(spec.path);
    expect(Object.fromEntries(url.searchParams)).toEqual(spec.query ?? {});
    expect(init?.method).toBe(spec.method);
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    // fetch가 실제 전송할 요청을 만들어 본문과 콘텐츠 형식을 함께 검사한다
    const request = new Request(input, init);
    expect(request.headers.get("accept")).toBe("application/json");
    if (spec.body === undefined) {
      expect(init?.body).toBeUndefined();
      expect(request.body).toBeNull();
      expect(request.headers.get("content-type")).toBeNull();
    } else {
      expect(request.headers.get("content-type")).toBe("application/json");
      expect(await request.json()).toEqual(spec.body);
    }
  });

  // 선택 쿼리가 없으면 undefined 문자열이나 빈 키를 추가하지 않는다
  it("validateSession의 shapes를 생략할 수 있다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(gate));
    await createClients(fetcher).knowledge.validateSession("s-yeongjong", 2, 1);
    expect(
      Object.fromEntries(
        new URL(String(fetcher.mock.calls[0][0])).searchParams,
      ),
    ).toEqual({
      revision: "2",
      masterVersion: "1",
    });
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });
});
