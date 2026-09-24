// 게이트웨이 API만 호출하고 응답 타입은 공용 계약에서 가져온다.
import type {
  FestivalSummary,
  ForecastReport,
} from "@crowdcast/contracts/types";

// 실패 응답을 그대로 삼키지 않아 화면에서 오류 상태를 표시할 수 있게 한다.
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
  return (await response.json()) as T;
}

// 화면에 표시할 행사 목록을 게이트웨이에서 받는다.
export function getFestivals(signal?: AbortSignal): Promise<FestivalSummary[]> {
  return getJson<FestivalSummary[]>("/festivals", signal);
}

// 예보서 수치는 계약의 값을 그대로 받는다.
export function getForecastReport(
  forecastId: string,
  signal?: AbortSignal,
): Promise<ForecastReport> {
  return getJson<ForecastReport>(
    `/forecasts/${encodeURIComponent(forecastId)}`,
    signal,
  );
}
