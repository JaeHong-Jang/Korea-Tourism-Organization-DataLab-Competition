// docx 중계의 바이너리·다운로드 헤더·본문 마감을 검증한다
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { DOCX_CONTENT_TYPE } from "../src/clients/records-relay-client.js";
import { plan, proxyConfig } from "./proxy-fixture.js";

// 예상된 오류 로그와 가짜 타이머는 테스트마다 정리한다
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 바이너리 특수 바이트와 두 다운로드 헤더가 변하지 않는지 확인한다
it("docx의 바이트와 Content-Type·Content-Disposition을 보존한다", async () => {
  const bytes = new Uint8Array([80, 75, 3, 4, 0, 255, 128, 13, 10]);
  const headers = {
    "content-type": DOCX_CONTENT_TYPE,
    "content-disposition": "attachment; filename=yeongjong.docx",
  };
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(bytes, { headers }),
  );
  const response = await createApp(proxyConfig, fetcher).request(
    `/api/records/plans/${plan.id}/export.docx`,
  );
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  for (const [name, value] of Object.entries(headers))
    expect(response.headers.get(name)).toBe(value);
});

// JSON이나 HTML 오류 본문을 문서 다운로드로 오인하지 않는다
it.each(["application/json", "text/html", "application/octet-stream"])(
  "docx MIME %s는 503",
  async (contentType) => {
    const response = await createApp(
      proxyConfig,
      async () =>
        new Response("오류", { headers: { "content-type": contentType } }),
    ).request(`/api/records/plans/${plan.id}/export.docx`);
    expect(response.status).toBe(503);
    expect(console.error).toHaveBeenCalled();
  },
);

// 문서 상류가 없거나 아직 구현하지 않은 경우도 공통 장애를 따른다
it.each([404, 503, "offline"])("docx 상류 %s", async (status) => {
  const fetcher = vi.fn<typeof fetch>(async () => {
    if (status === "offline") throw new TypeError("연결 거부");
    return new Response(null, { status: Number(status) });
  });
  expect(
    (
      await createApp(proxyConfig, fetcher).request(
        `/api/records/plans/${plan.id}/export.docx`,
      )
    ).status,
  ).toBe(503);
});
