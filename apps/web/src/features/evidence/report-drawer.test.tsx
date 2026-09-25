// 반복된 근거 칩 가운데 실제 출발 위치로 키보드 포커스를 되돌린다.
// @vitest-environment jsdom
import type { ForecastReport } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import fixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { EvidenceChip } from "../../components/common/evidence-chip";
import {
  observationForEvidence,
  ReportDrawer,
  useEvidenceDrawer,
} from "./report-drawer";

const report = fixture as unknown as ForecastReport;
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 같은 데이터셋의 관측 셋 중 근거 요약의 ID가 가리키는 수치만 고른다.
it("데이터 근거와 관측 ID가 맞지 않으면 다른 지표 수치를 숨긴다", () => {
  const daily = report.forecast.observations[0];
  const share = {
    ...daily,
    id: "obs-28110-nonlocal-share",
    featureName: "nonlocal_share",
    value: 0.39,
    unit: "비율" as const,
  };
  const evidence = report.evidence.find((item) => item.kind === "data");
  if (!evidence) throw new Error("데이터 근거 픽스처 없음");
  const observations = [daily, share];
  expect(observationForEvidence(evidence, observations)).toBeNull();
  expect(
    observationForEvidence(
      { ...evidence, summary: JSON.stringify({ id: share.id }) },
      observations,
    ),
  ).toEqual(share);
  expect(
    observationForEvidence(
      { ...evidence, quantityIds: [daily.id, share.id] },
      observations,
    ),
  ).toBeNull();
});

// 두 번째 칩에서 열고 Escape를 눌렀을 때 첫 번째 칩으로 잘못 돌아가지 않는다.
it("Escape와 읽던 곳으로가 출발 칩에 포커스를 돌린다", async () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const evidence = report.evidence.find(
    (item) => item.kind === "rule" && item.clauseId,
  );
  if (!evidence) throw new Error("법정 근거 픽스처 없음");
  function Example() {
    const drawer = useEvidenceDrawer();
    return (
      <>
        <EvidenceChip
          evidence={evidence}
          evidenceOrder={report.evidence}
          onOpen={drawer.open}
        />
        <EvidenceChip
          evidence={evidence}
          evidenceOrder={report.evidence}
          onOpen={drawer.open}
        />
        <ReportDrawer
          report={report}
          selectedId={drawer.selectedId}
          onClose={drawer.close}
        />
      </>
    );
  }
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Example />
      </MemoryRouter>,
    ),
  );
  const chips = node.querySelectorAll<HTMLAnchorElement>("a.evidence-chip");
  await act(async () => chips[1]?.click());
  expect(document.activeElement).toBe(
    node.querySelector("#evidence-ev-rule-legal-hazard summary"),
  );
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(chips[1]);
  await act(async () => chips[0]?.click());
  await act(async () =>
    node
      .querySelector<HTMLButtonElement>(".report-drawer-actions button")
      ?.click(),
  );
  expect(document.activeElement).toBe(chips[0]);
  await act(async () => root.unmount());
  node.remove();
  vi.unstubAllGlobals();
});
