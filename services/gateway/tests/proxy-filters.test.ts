// 행사 필터 조합과 조회 쿼리의 계약 위반을 검사한다
import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { festival, proxyConfig, weather } from "./proxy-fixture.js";

// 순서가 바뀌면 드러나도록 같은 시도 안에 여러 행사 유형을 둔다
const festivals = [
  {
    ...festival,
    eventId: "e-incheon-pentaport-2025",
    name: "인천 펜타포트 락 페스티벌",
    type: "공연",
    level: 3,
  },
  {
    ...festival,
    eventId: "e-busan-fireworks-2025",
    name: "부산불꽃축제",
    sigunguCode: "26500",
    sigunguName: "부산 수영구",
  },
  festival,
  {
    ...festival,
    eventId: "e-songdo-fireworks-2025",
    name: "송도맥주축제",
    type: "먹거리",
    level: 3,
  },
];

afterEach(() => vi.restoreAllMocks());

// 시도·유형·단계의 모든 조합은 AND 조건으로 적용하고 원래 순서를 보존한다
it.each([
  ["", [0, 1, 2, 3]],
  ["sido=인천", [0, 2, 3]],
  ["sido=28", [0, 2, 3]],
  ["sido=인천광역시", [0, 2, 3]],
  ["type=불꽃", [1, 2]],
  ["level=3", [0, 3]],
  ["sido=인천&type=불꽃", [2]],
  ["sido=28&level=3", [0, 3]],
  ["type=불꽃&level=4", [1, 2]],
  ["sido=28&type=불꽃&level=4", [2]],
  ["sido=인천&type=불꽃&level=1", []],
] as const)("필터 %s", async (query, indexes) => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(festivals));
  const response = await createApp(proxyConfig, fetcher).request(
    `/api/festivals?from=2025-10-01&to=2025-10-31&${query}`,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(
    indexes.map((index) => festivals[index]),
  );
  expect(String(fetcher.mock.calls[0][0])).toBe(
    `${proxyConfig.services.forecast}/v1/festivals/upcoming?from=2025-10-01&to=2025-10-31`,
  );
});

// 필터로 빠질 항목이라도 잘못된 수치는 먼저 차단한다
it("선택에서 제외될 행의 계약 위반도 거부한다", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json([festival, { ...festivals[0], peakP50: "21000" }]),
  );
  expect(
    (await createApp(proxyConfig, fetcher).request("/api/festivals?type=불꽃"))
      .status,
  ).toBe(503);
});

// 잘못된 날짜·열거값·수치와 필수 쿼리 누락은 상류 호출 전에 차단한다
it.each([
  "/api/festivals?from=2025-02-30",
  "/api/festivals?to=내일",
  "/api/festivals?type=축제",
  "/api/festivals?level=0",
  "/api/festivals?level=5",
  "/api/festivals?level=2.5",
  "/api/festivals?level=",
  "/api/weather",
  "/api/weather?lat=&lng=126&at=2025-10-18T19:00:00Z",
  "/api/weather?lat=Infinity&lng=126&at=2025-10-18T19:00:00Z",
  "/api/weather?lat=37&lng=126&at=내일",
  "/api/forecasts/wrong",
  "/api/evidence/wrong",
  "/api/insights/I7",
])("잘못된 요청 %s", async (path) => {
  const fetcher = vi.fn<typeof fetch>();
  const response = await createApp(proxyConfig, fetcher).request(path);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    code: "INVALID_REQUEST",
    message: expect.any(String),
  });
  expect(fetcher).not.toHaveBeenCalled();
});

// 시간대의 더하기 기호와 소수 좌표가 상류에 그대로 복원된다
it("날씨 쿼리를 URL 인코딩한다", async () => {
  const query = new URLSearchParams({
    lat: "37.49",
    lng: "126.58",
    at: weather.at,
  });
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(weather));
  expect(
    (await createApp(proxyConfig, fetcher).request(`/api/weather?${query}`))
      .status,
  ).toBe(200);
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(Object.fromEntries(url.searchParams)).toEqual(
    Object.fromEntries(query),
  );
});
