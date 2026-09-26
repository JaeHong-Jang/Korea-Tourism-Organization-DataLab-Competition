// 영종 발행 스냅샷의 문장·근거 경로와 출처 합치기를 검증한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import fixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { cautions, EvidenceBrief, sourceCards } from "./evidence-brief";
import { buildEvidenceMap } from "./graph-data";

const report = fixture as unknown as ForecastReport;

// 계약 픽스처의 발행 문장과 카드 번호표를 빠짐없이 노드로 옮긴다.
describe("발행 스냅샷 근거 지도", () => {
  it("문장·근거 수와 직접 인용 간선을 보존한다", () => {
    const map = buildEvidenceMap(report);
    expect(map.nodes.filter((node) => node.kind === "claim")).toHaveLength(
      report.claims.length,
    );
    expect(map.nodes.filter((node) => node.kind === "evidence")).toHaveLength(
      report.evidence.length,
    );
    expect(
      map.edges.filter((edge) => edge.source.startsWith("claim:")),
    ).toHaveLength(
      report.claims.reduce(
        (count, claim) => count + claim.evidenceIds.length,
        0,
      ),
    );
    expect(map.datalabClaimCount).toBe(0);
  });

  // 서로 다른 카드가 같은 데이터셋을 참조하면 출처와 문서는 각각 하나다.
  it("같은 출처를 합치고 데이터랩까지 닿는 발행 문장을 센다", () => {
    const copy = structuredClone(report);
    const dataEvidence = copy.evidence.find((item) => item.kind === "data");
    if (!dataEvidence) throw new Error("데이터 근거 픽스처가 없어요.");
    copy.evidence.push({ ...dataEvidence, id: "ev-baseline-28110-again" });
    copy.claims[0].evidenceIds.push(dataEvidence.id, "ev-baseline-28110-again");
    copy.claims[1].evidenceIds.push(dataEvidence.id);
    const map = buildEvidenceMap(copy);
    expect(
      map.nodes.filter(
        (node) =>
          node.id === `source:dataset:${dataEvidence.source?.datasetId}`,
      ),
    ).toHaveLength(1);
    expect(
      map.nodes.filter(
        (node) =>
          node.id === `document:dataset:${dataEvidence.source?.datasetId}`,
      ),
    ).toHaveLength(1);
    expect(map.datalabClaimCount).toBe(2);
  });

  // 출처 카드는 같은 원문을 한 장으로 묶고, 주의점은 가정·통과 못 한 검사·검증 한계만 모은다.
  it("출처를 문서 단위로 묶고 주의할 점을 가려낸다", () => {
    const { cards } = sourceCards(report);
    expect(
      cards.some(
        (card) => card.id === "document:clause:law-disaster-act-enf-73-9",
      ),
    ).toBe(true);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    expect(cards.every((card) => card.numbers.length > 0)).toBe(true);
    for (const item of cautions(report))
      expect(
        !item.evidence ||
          item.evidence.kind === "assumption" ||
          item.evidence.checkResult?.passed === false,
      ).toBe(true);
  });

  // 근거 화면은 판정 흐름·두 칸·문장·출처 순서로 그린다.
  it("판정부터 출처까지 한 화면에 그린다", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <EvidenceBrief
          report={report}
          onOpen={() => {}}
          onViewClaim={() => {}}
        />
      </MemoryRouter>,
    );
    for (const text of [
      "판정 흐름",
      "판정을 받치는 근거",
      "주의할 점",
      "문장별 근거",
      "근거와 출처",
    ])
      expect(html).toContain(text);
  });
});
