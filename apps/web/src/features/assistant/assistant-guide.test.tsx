// 사용법 단계가 지도·목록·상담·근거 그래프로 이어지는지 확인한다.
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AssistantGuide } from "./assistant-guide";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 경로 이동과 단계 문구를 함께 읽어 화면별 안내가 이어지는지 검사한다.
function RouteEcho() {
  return <output data-route="guide">{useLocation().pathname}</output>;
}

// 안내 버튼은 실제 화면 순서대로 옮기고 마지막에 닫힌다.
it("다섯 안내 단계가 해당 화면으로 이동한다", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const node = document.createElement("div");
  const root = createRoot(node);
  const close = vi.fn();
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <RouteEcho />
        <AssistantGuide onClose={close} />
      </MemoryRouter>,
    ),
  );
  const titles = [
    "지도에서 행사 보기",
    "목록에서 행사 고르기",
    "예보 받기",
    "고래와 대화하기",
    "근거 그래프 보기",
  ];
  const paths = ["/", "/", "/consult", "/consult", "/graph"];
  for (const [index, title] of titles.entries()) {
    expect(node.querySelector(".assistant-guide h2")?.textContent).toBe(title);
    expect(node.querySelector("[data-route='guide']")?.textContent).toBe(
      paths[index],
    );
    await act(async () =>
      node
        .querySelector<HTMLButtonElement>(
          ".assistant-guide__actions button:last-child",
        )
        ?.click(),
    );
  }
  expect(close).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
