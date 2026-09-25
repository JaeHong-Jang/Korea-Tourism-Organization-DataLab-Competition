// 영종 발행 스냅샷의 문장·근거 경로와 출처 합치기를 검증한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import fixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { buildEvidenceMap, filterEvidenceMap } from "./graph-data";

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

  // 종류 필터는 선택되지 않은 근거와 고립된 문장만 숨기고 좌표용 ID는 보존한다.
  it("선택한 종류의 근거와 연결 경로만 남긴다", () => {
    const map = buildEvidenceMap(report);
    const filtered = filterEvidenceMap(map, ["rule"]);
    expect(
      filtered.nodes.filter((node) => node.kind === "evidence"),
    ).toHaveLength(2);
    expect(filtered.nodes.filter((node) => node.kind === "claim")).toHaveLength(
      1,
    );
    expect(
      filtered.nodes.some(
        (node) => node.id === "document:clause:law-disaster-act-enf-73-9",
      ),
    ).toBe(true);
    expect(
      filtered.edges.every(
        (edge) =>
          filtered.nodes.some((node) => node.id === edge.source) &&
          filtered.nodes.some((node) => node.id === edge.target),
      ),
    ).toBe(true);
  });
});
