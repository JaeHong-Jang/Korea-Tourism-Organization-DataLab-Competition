// 행사명 밖 칸을 눌러도 같은 행사가 선택되는지 확인한다.
// @vitest-environment jsdom
import type { Event } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import eventFixture from "../../../../../packages/contracts/fixtures/event/valid-yeongjong.json";
import { EventList } from "./event-list";

it("일자 칸을 누르면 그 행사를 선택한다", async () => {
  const event = eventFixture as Event;
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const onSelect = vi.fn();
  await act(async () => {
    root.render(
      <EventList
        rows={[{ event, snapshots: [] }]}
        selectedId={null}
        onSelect={onSelect}
        saved={new Set()}
      />,
    );
  });
  const dateCell = node.querySelector("td");
  await act(async () => {
    dateCell?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onSelect).toHaveBeenCalledWith(event.id);
  await act(async () => root.unmount());
  node.remove();
});
