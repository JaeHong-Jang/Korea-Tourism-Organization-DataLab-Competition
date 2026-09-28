// 연구 모델을 어떤 규칙으로 나눠 매달 다시 학습했는지 보여 준다.
import { num } from "./research-format";
import { researchV2 } from "./research-v2-data";

// 분할 규칙은 설계 설명이라 여기에 두고, 행 수는 산출물에서 생성한 값을 쓴다.
const rules = [
  ["자료 기준일", "개최 14일 전(D-14)까지 공개된 자료만 학습과 입력에 쓴다"],
  [
    "구간 보정",
    "과거 군집의 최근 20%(올림, 최소 50군집)를 예측구간 보정 전용으로 뺀다",
  ],
  [
    "경계 처리",
    "평가 군집에 속한 과거 행과 공개가 덜 끝난 군집은 학습에서 제외한다",
  ],
  [
    "중복 가중치",
    "같은 시군구·기간이 겹치면 총 가중치가 1이 되게 나눠 채점한다",
  ],
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
      <p>
        한 번 나눠 끝내지 않고 <strong>평가할 달마다 다시 학습</strong>했습니다.
        그 달 행사의 기준일까지 공개된 자료만 학습에 넣고, 끝난 예보를 나중에
        다시 채점하지 않습니다.
      </p>
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
