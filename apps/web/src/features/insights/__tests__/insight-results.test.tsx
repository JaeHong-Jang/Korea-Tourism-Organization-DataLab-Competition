// 인사이트의 빈 상태와 서식4 문장 복사를 계약 모양으로 확인한다.
// @vitest-environment jsdom
import type { DatalabSpec, Insight } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import specFixture from "../../../../../../packages/contracts/fixtures/datalab-spec/valid-example.json";
import evidenceFixture from "../../../../../../packages/contracts/fixtures/evidence/valid-data.json";
import { DatalabSpecTable } from "../datalab-spec-table";
import { InsightResults } from "../insight-results";

const ready = <T,>(value: T) => ({ status: "ready" as const, value });
const html = (node: React.ReactNode) => renderToStaticMarkup(node);
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 인사이트가 없을 때에는 카드마다 다음 행동을 주되 복사 버튼은 숨긴다.
it("인사이트 빈 상태에는 복사 버튼이 없다", () => {
  const output = html(
    <InsightResults first={{ status: "empty" }} second={{ status: "empty" }} />,
  );
  expect(output).toContain("9/27");
  expect(output.match(/자료 다시 확인/g)).toHaveLength(2);
  expect(output).not.toContain("서식4용 문장 복사");
  expect(output).toContain("동네지기");
});

// 한 카드의 계약 오류나 대기 상태가 다른 카드의 확인된 결과를 가리지 않는다.
it("I1 오류와 I2 대기에도 다른 카드 상태를 각각 표시한다", () => {
  const insight = {
    key: "I2",
    title: "인천 중구 평시 방문",
    headline: { value: 14500, unit: "명/일", text: "방문자 수를 비교했어요." },
    sampleSize: 86,
    comparablePairs: 1,
    period: { from: "2025-01-01", to: "2025-12-31" },
    series: [],
    evidenceIds: [evidenceFixture.id],
    evidence: [evidenceFixture],
    computedAt: "2026-09-27T12:00:00+09:00",
  } as Insight;
  const failed = html(
    <InsightResults first={{ status: "error" }} second={ready(insight)} />,
  );
  expect(failed).toContain('data-insight="I1"');
  expect(failed).toContain("자료 형식을 확인할 수 없어요");
  expect(failed).toContain('data-insight="I2"');
  expect(failed).toContain("인천 중구 평시 방문");
  expect(failed).toContain("14,500");
  const pending = html(
    <InsightResults
      first={ready({ ...insight, key: "I1" })}
      second={{ status: "loading" }}
    />,
  );
  expect(pending).toContain("자료를 불러오는 중이에요");
  expect(pending).toContain("14,500");
});

// 확인된 명세 행과 인사이트만 표·복사 동작에 들어간다.
it("실제 활용 명세를 읽고 인사이트 문장을 표본·기간과 함께 복사한다", async () => {
  const spec = specFixture as DatalabSpec;
  expect(html(<DatalabSpecTable state={ready(spec)} />)).toContain(
    "2026-09-27",
  );
  expect(html(<DatalabSpecTable state={ready(spec)} />)).toContain(
    "외지인·현지인·외국인 방문자 수",
  );
  const insight = {
    key: "I1",
    title: "인천 중구 평시 방문",
    headline: { value: 14500, unit: "명/일", text: "방문자 수를 비교했어요." },
    sampleSize: 86,
    comparablePairs: 1,
    period: { from: "2025-01-01", to: "2025-12-31" },
    series: [],
    evidenceIds: [evidenceFixture.id],
    evidence: [evidenceFixture],
    computedAt: "2026-09-27T12:00:00+09:00",
  } as Insight;
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () =>
    root.render(
      <InsightResults first={ready(insight)} second={{ status: "empty" }} />,
    ),
  );
  await act(async () => node.querySelector("button")?.click());
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining("표본 86건, 2025-01-01~2025-12-31"),
  );
  expect(node.textContent).toContain("복사됨");
  await act(async () => root.unmount());
});

// 활용 명세표의 가로 스크롤 영역은 키보드로 닿도록 포커스 가능한 영역이다.
it("활용 명세표 스크롤 영역에 포커스와 이름을 준다", () => {
  const spec = specFixture as DatalabSpec;
  const output = html(<DatalabSpecTable state={ready(spec)} />);
  expect(output).toContain('role="region"');
  expect(output).toContain('tabindex="0"');
  expect(output).toContain('aria-label="데이터랩 활용 명세 표, 좌우로 스크롤"');
});
