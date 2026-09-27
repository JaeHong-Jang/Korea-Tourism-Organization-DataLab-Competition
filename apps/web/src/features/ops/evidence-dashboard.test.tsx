// 전체 발행 문장의 근거 연결 운영 지표를 독립적으로 검증한다.
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { usage } from "../validation/__tests__/validation-fixtures";
import { EvidenceDashboard } from "./evidence-dashboard";

const ready = <T,>(value: T) => ({ status: "ready" as const, value });

// 분모가 없을 때 비율을 만들지 않고 기록 부재를 표시한다.
it("분모 없는 근거 상태를 표시한다", () => {
  const output = renderToStaticMarkup(
    <EvidenceDashboard state={ready({ ...usage, publishedClaims: 0 })} />,
  );
  expect(output).toContain("발행 문장이 아직 없어요");
  expect(output).toContain("0건");
  expect(output).toContain("검증 기록 없음");
  expect(output).not.toContain("0.0%");
});

// 데이터랩 도달과 전체 연결은 서로 다른 분자를 쓴다.
it("두 근거 비율을 분리한다", () => {
  const output = renderToStaticMarkup(
    <EvidenceDashboard state={ready(usage)} />,
  );
  expect(output).toContain("80.0%");
  expect(output).toContain("30.0%");
  expect(output).toContain("방문자");
  expect(output).toContain("0건");
});

// 데이터랩 메뉴 여부와 관계없이 모든 데이터셋과 0건 행을 남긴다.
it("근거 데이터셋 전체를 메뉴가 있는 순서로 표시한다", () => {
  const datasets = [
    { datasetId: "ds-other", title: "기상 관측", datalabMenu: null, count: 0 },
    {
      datasetId: "ds-visitors",
      title: "지역별 방문자 수",
      datalabMenu: "방문자 수",
      count: 2,
    },
  ];
  const output = renderToStaticMarkup(
    <EvidenceDashboard
      state={ready({ ...usage, evidenceByDataset: datasets })}
    />,
  );
  expect(output).toContain("기상 관측");
  expect(output).toContain("0건");
  expect(output.indexOf("지역별 방문자 수")).toBeLessThan(
    output.indexOf("기상 관측"),
  );
  expect(output).toContain("validation-datalab-menu");
});
