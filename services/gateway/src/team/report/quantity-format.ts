// Quantity의 단위에 맞춰 문장 표시와 숫자 검사가 같은 서식을 사용한다
const people = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const decimals = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

// 인원은 정수로 표시하고 나머지 단위는 소수 둘째 자리까지만 남긴다
export function formatQuantity(value: number, unit: string): string {
  return (unit === "명" || unit === "명/일" ? people : decimals).format(value);
}
