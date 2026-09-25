// 계약에서 받은 수치와 날짜를 한국어 화면 표기로만 바꾼다.
const people = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 20 });
const tenThousands = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});

// 발행 예보서에는 수치를 축약·반올림하지 않고 천 단위 쉼표만 더한다.
export function formatSnapshotNumber(value: number | null): string {
  if (value == null) return "자료 없음";
  const [integer, fraction] = String(value).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

// 발행 근거의 비교 수치에는 원본 단위와 범위를 함께 둔다.
export function formatSnapshotQuantity(quantity: QuantityDisplay): string {
  const value = quantity.value ?? quantity.p50;
  return value == null
    ? "자료 없음"
    : `${formatSnapshotNumber(value)}${quantity.unit} · ${quantity.timeUnit} · ${quantity.spatialScope}${quantity.estimated ? " · 추정" : ""}`;
}

// 1만 명부터 만 단위 한 자리로 보여 주고 작은 값은 천 단위 쉼표를 쓴다.
export function formatPeople(value: number): string {
  return value >= 10_000
    ? `${tenThousands.format(value / 10_000)}만 명`
    : `${people.format(value)}명`;
}

// 예측 구간의 양 끝을 같은 인원 규칙으로 표기한다.
export function formatRange(low: number, high: number): string {
  return `${formatPeople(low)} ~ ${formatPeople(high)}`;
}

type QuantityDisplay = {
  value: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  unit: string;
  timeUnit: "순간" | "일" | "기간누적";
  spatialScope: "행사장" | "행정동" | "시군구";
  estimated: boolean;
  valueKind?: string;
};

// 계약에 명시된 대표값을 먼저 쓰고 값이 없을 때만 중앙값으로 돌아간다.
export function representativeValue(quantity: QuantityDisplay): number | null {
  return quantity.value ?? quantity.p50;
}

// 수치의 단위와 집계 시간, 공간 범위, 추정 여부를 한 번에 남긴다.
export function formatQuantity(
  quantity: QuantityDisplay,
  part?: "full" | "detail",
): string;
export function formatQuantity(value: number, unit: string): string;
export function formatQuantity(
  quantityOrValue: QuantityDisplay | number,
  unit?: string,
): string {
  if (typeof quantityOrValue === "number") {
    if (unit === "명" || unit === "명/일")
      return `${formatPeople(quantityOrValue)}${unit === "명/일" ? "/일" : ""}`;
    return `${decimal.format(quantityOrValue)}${unit ?? ""}`;
  }

  // 수치 노드에는 중앙값·예측 구간과 집계 정의를 함께 붙인다.
  const quantity = quantityOrValue;
  const center = representativeValue(quantity);
  const main =
    center == null ? "값 없음" : formatQuantity(center, quantity.unit);
  const range =
    quantity.p10 != null && quantity.p90 != null
      ? ` · 예측 구간 ${formatQuantity(quantity.p10, quantity.unit)} ~ ${formatQuantity(quantity.p90, quantity.unit)}`
      : "";
  const time =
    quantity.timeUnit === "기간누적" ? "기간 누적" : quantity.timeUnit;
  const estimate = quantity.estimated
    ? quantity.timeUnit === "순간" && quantity.valueKind === "예측"
      ? " · 추정 산식 기반"
      : " · 추정"
    : "";
  const detail = `(${time} · ${quantity.spatialScope})${range}${estimate}`;
  return unit === "detail" ? detail : `${main} ${detail}`;
}

// 서버 시각을 한국 표준시의 월일·요일·시각으로 고정한다(일괄 예보처럼 시각 없이 00:00이면 날짜만).
export function formatDate(value: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 확인 필요";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: dateOnly ? "UTC" : "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const day = `${part("month")}.${part("day")}(${part("weekday")})`;
  const midnight = part("hour") === "00" && part("minute") === "00";
  return dateOnly || midnight ? day : `${day} ${part("hour")}:${part("minute")}`;
}

// 계약의 0~1 확률을 정수 백분율 또는 이미 계산된 구간으로 표기한다.
export function formatPercent(
  value: number | { low: number; high: number },
): string {
  if (typeof value === "number") return `${Math.round(value * 100)}%`;
  return `${Math.round(value.low * 100)}~${Math.round(value.high * 100)}%`;
}
