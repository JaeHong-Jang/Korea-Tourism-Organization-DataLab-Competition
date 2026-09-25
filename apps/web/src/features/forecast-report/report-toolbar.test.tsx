// 계획 초안 버튼이 응답 상태에 따라 내려받거나 비활성화되는지 확인한다.
// @vitest-environment jsdom
import type { ForecastReport } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { ReportToolbar } from "./report-toolbar";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.restoreAllMocks());

// API 결과별로 버튼 상태와 화면 사유가 일치하는지 실제 클릭으로 검사한다.
it.each([
  [200, { docxHref: "/api/plans/plan-yeongjong/export.docx" }, ""],
  [404, {}, "계획 초안 경로가 아직 없어요."],
  [502, {}, "계획 초안을 받지 못했어요."],
] as const)("docx 응답 %i의 버튼 상태", async (status, body, reason) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: status === 200,
      json: async () => body,
    }),
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  await act(async () =>
    root.render(
      <ReportToolbar
        report={
          {
            ...fixture,
            brief: { ...fixture.brief, actions: [] },
          } as unknown as ForecastReport
        }
      />,
    ),
  );
  const button = [...node.querySelectorAll("button")].find((item) =>
    item.textContent?.includes("docx"),
  );
  expect(button?.disabled).toBe(false);
  await act(async () => button?.click());
  expect(button?.disabled).toBe(true);
  if (status === 200) expect(click).toHaveBeenCalledOnce();
  else {
    expect(click).not.toHaveBeenCalled();
    expect(node.textContent).toContain(reason);
  }
  await act(async () => root.unmount());
  node.remove();
  vi.unstubAllGlobals();
});
