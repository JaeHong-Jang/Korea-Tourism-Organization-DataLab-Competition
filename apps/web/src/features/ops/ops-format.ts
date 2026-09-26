// 운영 기록의 날짜·시간·상태를 화면에 읽기 쉽게 표기한다.
export const runStatus = {
  running: "실행 중",
  passed: "통과",
  failed: "실패",
} as const;
export const stageStatus = {
  pending: "대기",
  running: "실행 중",
  passed: "통과",
  failed: "실패",
  skipped: "건너뜀",
} as const;
export const stageName = {
  fetch: "수집",
  labels: "정답",
  features: "피처",
  train: "학습",
  backtest: "백테스트",
  batch: "일괄 예보",
  publish: "발행",
} as const;

// 서버 시각을 한국 표기로 바꾸되 원본 시각은 title로 남긴다.
export function dateTime(value: string | null): string {
  if (!value) return "진행 중";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "날짜 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

// 단계 소요 시간을 밀리초 원본에서 초·분으로 환산한다.
export function duration(ms: number | null): string {
  if (ms === null) return "측정 전";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}초`;
  return `${Math.floor(ms / 60_000)}분 ${Math.round((ms % 60_000) / 1000)}초`;
}

// 자료 기준일과 응답 생성일 사이의 달력 일수로 반영 지연을 구한다.
export function lagDays(
  observed: string | null,
  generated: string,
): number | null {
  if (!observed) return null;
  const end = generated.slice(0, 10);
  const first = Date.parse(`${observed}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(first) && Number.isFinite(last)
    ? Math.max(0, Math.round((last - first) / 86_400_000))
    : null;
}
