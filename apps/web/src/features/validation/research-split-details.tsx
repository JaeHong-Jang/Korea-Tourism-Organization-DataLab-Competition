// 연구 모델을 어떤 규칙으로 나눠 매달 다시 학습했는지 보여 준다.
import { num } from "./research-format";
import { researchV2 } from "./research-v2-data";

// 입력과 분할 규칙은 설계 설명이라 여기에 두고, 행 수는 산출물에서 생성한 값을 쓴다.
const rules = [
  ["입력", "행사 일정·유형·요금·주최, 공휴일, 지역 평시 방문, 지난 회차 순증"],
  ["쓰지 않은 것", "행사 뒤 실제 방문, 공개 시점을 모르는 예산·발표 인원"],
  ["자료 기준일", "개최 14일 전까지 공개된 자료만"],
  ["범위 보정", "최근 20% 행사로 예측 범위를 맞춤"],
] as const;
const roles: Record<number, string> = {
  2024: "개발 — 설정 선택에 사용",
  2025: "선택 이후 평가",
  2026: "선택 이후 평가 · 1~8월",
};

// 월별로 다시 학습하는 구조라 연도마다 학습·보정·평가 수가 달라지는 것을 표로 밝힌다.
export function ResearchSplitDetails() {
  const { split } = researchV2;
  return (
    <div className="research-detail">
      <p>평가할 달마다 그 시점까지 공개된 자료로 다시 학습했어요.</p>
      <dl className="research-rules">
        {rules.map(([term, text]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <section
        className="validation-table-scroll"
        aria-label="연도별 학습·보정·평가 행 수"
      >
        <table>
          <thead>
            <tr>
              <th>연도</th>
              <th>쓰임</th>
              <th>첫 달 학습</th>
              <th>첫 달 보정</th>
              <th>마지막 평가 달 학습</th>
              <th>그 해 평가</th>
            </tr>
          </thead>
          <tbody>
            {split.annual.map((item) => (
              <tr key={item.year}>
                <th>{item.year}년</th>
                <td>{roles[item.year]}</td>
                <td>{num(item.firstTrain)}행</td>
                <td>{num(item.firstCalibration)}행</td>
                <td>{num(item.lastTrain)}행</td>
                <td>{num(item.evaluation)}행</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="research-detail__note">
        첫 달 기준일: {split.annual.map((item) => item.firstCutoff).join(" · ")}
        . 2026년은 1~8월까지입니다.
      </p>
    </div>
  );
}
