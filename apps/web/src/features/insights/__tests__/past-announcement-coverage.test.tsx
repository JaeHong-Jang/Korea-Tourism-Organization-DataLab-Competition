// 과거 발표 후보가 유효 비교쌍으로 오해되지 않고 잘못된 합계는 숨기는지 확인한다.
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PastAnnouncementCoverage } from "../past-announcement-coverage";

it("후보와 유효 비교를 구분하고 합계 오류를 표시하지 않는다", () => {
  const value = {
    targetCount: 2,
    coveredCount: 1,
    candidatePairs: 2,
    years: [
      { year: 2024, count: 1 },
      { year: 2025, count: 1 },
    ],
  };
  const output = renderToStaticMarkup(
    <PastAnnouncementCoverage value={value} />,
  );
  expect(output).toContain("아직 비교 확정 자료는 아니에요");
  expect(output).toContain("같은 행사가 중복");
  expect(
    renderToStaticMarkup(
      <PastAnnouncementCoverage value={{ ...value, candidatePairs: 3 }} />,
    ),
  ).toBe("");
  expect(renderToStaticMarkup(<PastAnnouncementCoverage value={null} />)).toBe(
    "",
  );
});
