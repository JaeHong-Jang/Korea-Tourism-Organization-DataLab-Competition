// 조회 오류·재시도·취소된 응답이 인사이트에 올바르게 반영되는지 검증한다.
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useInsightResource } from "../use-insight-resource";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 공개된 상태와 재시도 동작만 관찰하는 작은 화면이다.
function Resource({
  load,
}: {
  load: (signal: AbortSignal) => Promise<string>;
}) {
  const { state, retry } = useInsightResource(load);
  return (
    <div>
      <span>
        {state.status}:{state.value}
      </span>
      <button type="button" onClick={retry}>
        다시 확인
      </button>
    </div>
  );
}

it("연결 오류를 자료 없음으로 표시하지 않고 재시도할 수 있다", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("API 요청 실패: 503"))
    .mockResolvedValueOnce("정상 결과");
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () => root.render(<Resource load={load} />));
  expect(node.textContent).toContain("error:");
  await act(async () => node.querySelector("button")?.click());
  expect(node.textContent).toContain("ready:정상 결과");
  await act(async () => root.unmount());
});

it("이전 요청이 늦게 성공해도 새로운 결과를 덮지 않는다", async () => {
  let finish: (value: string) => void = () => {};
  const oldLoad = () =>
    new Promise<string>((resolve) => {
      finish = resolve;
    });
  const newLoad = vi.fn().mockResolvedValue("새 결과");
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () => root.render(<Resource load={oldLoad} />));
  expect(node.textContent).toContain("loading:");
  await act(async () => root.render(<Resource load={newLoad} />));
  await act(async () => finish("옛 결과"));
  expect(node.textContent).toContain("ready:새 결과");
  await act(async () => root.unmount());
});
