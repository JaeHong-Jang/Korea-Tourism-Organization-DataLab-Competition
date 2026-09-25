// 계획 조회 별칭의 계약 검증과 docx 다운로드 경로의 바이트·헤더 보존을 검사한다
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createRecordsClient } from "../src/clients/records-client.js";
import { DOCX_CONTENT_TYPE } from "../src/clients/records-relay-client.js";
import { plan, proxyConfig } from "./proxy-fixture.js";

// 의도적으로 거부한 상류 응답의 로그를 테스트 출력에서 정리한다
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// 저장 계약을 통과한 계획만 조회하고 외부 쿼리는 records에 전달하지 않는다
it("GET /api/plans/{id}는 records 계획 계약을 검증한다", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(plan));
  const response = await createApp(proxyConfig, fetcher).request(
    `/api/plans/${plan.id}?private=discard`,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(plan);
  expect(fetcher.mock.calls[0][0]).toBe(
    `${proxyConfig.services.records}/v1/plans/${plan.id}`,
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "GET",
    redirect: "manual",
  });
});

// 다른 id·누락된 섹션·유효하지 않은 상태는 다운로드 가능한 계획으로 노출하지 않는다
it.each(["id", "sections", "status"])(
  "계획 응답 %s 위반은 503",
  async (invalid) => {
    const body = structuredClone(plan);
    if (invalid === "id") body.id = "plan-sorae-2026";
    if (invalid === "sections") body.sections.pop();
    if (invalid === "status")
      Object.assign(body.sections[0], { status: "완료" });
    const response = await createApp(proxyConfig, async () =>
      Response.json(body),
    ).request(`/api/plans/${plan.id}`);
    expect(response.status).toBe(503);
  },
);

// docx는 JSON 변환 없이 이진 특수 바이트와 다운로드 헤더를 그대로 전달한다
it("GET /api/plans/{id}/export.docx는 문서 바이트와 헤더를 보존한다", async () => {
  const bytes = new Uint8Array([80, 75, 3, 4, 0, 255, 128, 13, 10]);
  const headers = {
    "content-type": DOCX_CONTENT_TYPE,
    "content-disposition":
      "attachment; filename=yeongjong.docx; filename*=UTF-8''%EC%98%81%EC%A2%85.docx",
  };
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(bytes, { headers }),
  );
  const response = await createApp(proxyConfig, fetcher).request(
    `/api/plans/${plan.id}/export.docx`,
  );
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  for (const [name, value] of Object.entries(headers))
    expect(response.headers.get(name)).toBe(value);
  expect(fetcher.mock.calls[0][0]).toBe(
    `${proxyConfig.services.records}/v1/plans/${plan.id}/export.docx`,
  );
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
    accept: DOCX_CONTENT_TYPE,
  });
});

// 조회와 다운로드는 모두 T-310의 동일한 상류 장애 응답을 사용한다
it.each(["", "/export.docx"])(
  "계획 경로 %s의 상류 없음은 503",
  async (suffix) => {
    const response = await createApp(
      proxyConfig,
      async () => new Response(null, { status: 404 }),
    ).request(`/api/plans/${plan.id}${suffix}`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  },
);

// 잘못된 다운로드 미디어 타입은 문서로 전달하지 않는다
it("docx 경로에 JSON 오류가 오면 503", async () => {
  const response = await createApp(proxyConfig, async () =>
    Response.json({ error: "unavailable" }),
  ).request(`/api/plans/${plan.id}/export.docx`);
  expect(response.status).toBe(503);
});

// 잘못된 id는 상류 호출 전에 거부하고 새 별칭은 조회 메서드만 허용한다
it.each(["bad", "plan-", "plan-a%2Fb", "plan-a%252Fb"])(
  "계획 id %s는 400",
  async (id) => {
    const fetcher = vi.fn<typeof fetch>();
    const app = createApp(proxyConfig, fetcher);
    expect((await app.request(`/api/plans/${id}`)).status).toBe(400);
    expect((await app.request(`/api/plans/${id}/export.docx`)).status).toBe(
      400,
    );
    expect(fetcher).not.toHaveBeenCalled();
  },
);

// 저장 요청도 원본 스키마를 통과해야 네트워크를 사용할 수 있다
it("클라이언트는 계약 밖 계획을 POST하지 않는다", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const records = createRecordsClient({
    baseUrl: proxyConfig.services.records,
    fetch: fetcher,
  });
  const invalid = structuredClone(plan);
  invalid.sections.pop();
  await expect(records.savePlan(invalid)).rejects.toThrow(
    "서비스 요청 계약 위반",
  );
  expect(fetcher).not.toHaveBeenCalled();
});
