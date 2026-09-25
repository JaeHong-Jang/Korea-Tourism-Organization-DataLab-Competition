// 계획 목차와 읽기 전용 수치, 메모 자동 저장·재시도를 확인한다.
// @vitest-environment jsdom
import type { ForecastReport, Plan } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import report from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { planFixture } from "../../../../../tests/e2e/fixtures/plan-yeongjong";
import { PlanEditor } from "./plan-editor";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let node: HTMLDivElement;
let root: Root;

// 브라우저 시간과 스크롤을 고정해 입력 멈춤 뒤 요청 횟수를 비교한다.
beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});

// 각 사례 뒤에는 이벤트 리스너와 타이머를 함께 정리한다.
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 실제 섹션 요소를 렌더하고 메모 입력을 React 이벤트로 보낸다.
async function renderEditor() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <PlanEditor
          initial={planFixture as unknown as Plan}
          report={report as unknown as ForecastReport}
        />
      </MemoryRouter>,
    ),
  );
}

// 계약에 맞는 응답은 요청 본문에 서버 시각만 갱신해 돌려준다.
function responseFor(body: string) {
  return {
    ok: true,
    json: async () => ({
      ...JSON.parse(body),
      updatedAt: "2026-09-25T09:01:00+09:00",
    }),
  };
}

// 목차 이동은 표제로 포커스를 옮기고 잠금 수치는 입력을 만들지 않는다.
it("아홉 목차를 이동하고 발행 본문과 잠금 수치를 읽기 전용으로 둔다", async () => {
  await renderEditor();
  expect(node.querySelectorAll(".plan-contents button")).toHaveLength(9);
  const target = [
    ...node.querySelectorAll<HTMLButtonElement>(".plan-contents button"),
  ][4];
  await act(async () => target.click());
  expect(document.activeElement?.id).toBe("plan-heading-staffing");
  expect(target.getAttribute("aria-current")).toBe("location");
  expect(node.textContent).toContain("p50 · 21000 명");
  expect(node.querySelectorAll(".plan-locked input")).toHaveLength(0);
  expect(
    node.querySelector('a[href="#evidence-ev-rule-legal-hazard"]'),
  ).not.toBeNull();
});

// 입력 한 번은 1초 후 PUT 한 번만 보내고 저장 완료 시각을 보여 준다.
it("메모를 디바운스 저장하고 미저장 상태의 이탈을 경고한다", async () => {
  const put = vi
    .fn()
    .mockImplementation((_path: string, options: RequestInit) =>
      Promise.resolve(responseFor(options.body as string)),
    );
  vi.stubGlobal("fetch", put);
  await renderEditor();
  const textarea = node.querySelector<HTMLTextAreaElement>("#notes-overview");
  expect(textarea).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, "출입구 위치 확인");
    textarea?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const leave = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leave);
  expect(leave.defaultPrevented).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(999));
  expect(put).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(put).toHaveBeenCalledOnce();
  expect(put.mock.calls[0][0]).toBe(
    "/api/records/plans/plan-yeongjong-example",
  );
  expect(node.textContent).toContain("저장됨");
});

// 실패한 PUT은 자동 반복하지 않고 사용자의 재시도 뒤에만 다시 보낸다.
it("저장 실패 후 재시도 버튼으로 한 번만 다시 보낸다", async () => {
  const put = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockImplementation((_path: string, options: RequestInit) =>
      Promise.resolve(responseFor(options.body as string)),
    );
  vi.stubGlobal("fetch", put);
  await renderEditor();
  const textarea = node.querySelector<HTMLTextAreaElement>("#notes-overview");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(textarea, "의료 동선 확인");
    textarea?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(node.textContent).toContain("저장 실패");
  expect(put).toHaveBeenCalledOnce();
  const retry = [...node.querySelectorAll("button")].find(
    (button) => button.textContent === "다시 저장",
  );
  await act(async () => retry?.click());
  expect(put).toHaveBeenCalledTimes(2);
  expect(node.textContent).toContain("저장됨");
});
