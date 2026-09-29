// 과거 발표 후보 확대 결과를 유효한 I1 비교 표본과 구분해서 보여 준다.
export function PastAnnouncementCoverage({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const years = data.years as { year: number; count: number }[];
  if (
    ![data.targetCount, data.coveredCount, data.candidatePairs].every(
      (n) => typeof n === "number" && Number.isInteger(n) && n >= 0,
    ) ||
    Number(data.targetCount) === 0 ||
    Number(data.coveredCount) > Number(data.targetCount) ||
    !Array.isArray(years) ||
    years.some(
      (row) =>
        !row ||
        !Number.isInteger(row.year) ||
        !Number.isInteger(row.count) ||
        row.count < 0 ||
        row.count > Number(data.coveredCount),
    ) ||
    new Set(years.map((row) => row.year)).size !== years.length ||
    years.reduce((sum, row) => sum + row.count, 0) !== data.candidatePairs
  )
    return null;
  return (
    <div className="insights-next-step">
      <h4>과거 발표 자료를 더 찾아봤어요</h4>
      <p>
        예보 대상 {Number(data.targetCount).toLocaleString("ko-KR")}개 중{" "}
        <b>{Number(data.coveredCount).toLocaleString("ko-KR")}개 행사</b>에 같은
        이름·지역의 과거 발표 자료 후보가 있어요. 행사·연도 조합은{" "}
        {Number(data.candidatePairs).toLocaleString("ko-KR")}개예요.
      </p>
      <p>
        아직 비교 확정 자료는 아니에요. 해당 연도의 행사장 관측값과 두 자료의
        기간·장소·집계 방식을 확인해야 해요.
      </p>
      <details className="insights-details">
        <summary>연도별 확보 후보와 다음 자료</summary>
        <table>
          <caption>
            발표 대상 연도별 후보 · 연도 사이에 같은 행사가 중복돼요
          </caption>
          <thead>
            <tr>
              <th scope="col">발표 대상 연도</th>
              <th scope="col">행사 수</th>
            </tr>
          </thead>
          <tbody>
            {years.map((row) => (
              <tr key={row.year}>
                <th scope="row">{row.year}년</th>
                <td>{row.count}개</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          다음 확보 자료: 같은 과거 연도의 행사장 방문객 CSV와 집계 조건, 주최측
          발표의 집계 방법·발표일. 미래 개최분의 관측값을 기다리는 작업은
          아니에요.
        </p>
      </details>
    </div>
  );
}
