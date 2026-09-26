// 3D를 보지 못해도 행사와 행사장 상태를 같은 데이터로 읽게 한다.
import type { FestivalSummary, Weather } from "@crowdcast/contracts/types";

// 선택과 필터 결과만 문장에 넣어 애니메이션 동안 라이브 영역을 갱신하지 않는다.
export function nationalDescription(
  festivals: FestivalSummary[],
  selectedId: string | null,
): string {
  const large = festivals.filter((festival) => festival.level === 4).length;
  const selected = festivals.find(
    (festival) => festival.eventId === selectedId,
  );
  const detail = selected
    ? ` · 선택: ${selected.name}(등급 ${selected.level}, 순간 최대 추정 p10~p90 ${selected.peakP10.toLocaleString("ko-KR")}~${selected.peakP90.toLocaleString("ko-KR")}명)`
    : "";
  return `전국 판 · 표시 행사 ${festivals.length}건 · 등급 4 대규모 ${large}건${detail}`;
}

// 디오라마의 정적 건물 수와 사용자가 고른 시각·날씨를 요약한다.
export function venueDescription(
  buildings: number,
  hour: number,
  weather: Weather | null,
): string {
  const condition =
    !weather || weather.source === "없음"
      ? "정보 없음"
      : weather.pty && weather.pty !== "없음"
        ? weather.pty
        : weather.sky;
  return `행사장 반경 약 1.2km · 건물 ${buildings}동 · 시각 ${String(hour).padStart(2, "0")}:00 · 날씨 ${condition}`;
}
