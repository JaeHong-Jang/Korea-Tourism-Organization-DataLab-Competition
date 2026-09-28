// 연구 화면들이 같은 규칙으로 수치를 적도록 서식을 한곳에 둔다.

// 천 단위 구분과 소수 자릿수를 화면 전체에서 통일한다.
export const num = (value: number, digits = 0) =>
  value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

// 평균 오차는 부호가 뜻(과소·과대예측)을 가지므로 양수에도 +를 붙인다.
export const signed = (value: number, digits = 0) =>
  `${value > 0 ? "+" : ""}${num(value, digits)}`;

// 포함률은 비율로 저장하고 화면에서만 백분율로 바꾼다.
export const percent = (value: number, digits = 1) =>
  `${(value * 100).toFixed(digits)}%`;
