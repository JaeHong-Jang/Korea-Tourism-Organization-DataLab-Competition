// 실제 행사 좌표의 가까운 표식을 묶어 일반 DOM 위에 읽기 쉽게 표시한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import type { MutableRefObject } from "react";
import { projectKorea } from "../projection";
import type { MapPoint, MapViewport } from "./types";

export type FestivalPin = {
  festival: FestivalSummary;
  point: MapPoint;
  count: number;
};
export type PinElements = MutableRefObject<Map<string, HTMLButtonElement>>;

// 선택 행사를 우선하고 표식을 임의로 옮기는 대신 같은 화면 영역의 행사 수를 표시한다.
export function groupFestivalPins(
  festivals: FestivalSummary[],
  selectedId: string | null,
  view: MapViewport | null,
  pixels: number,
): FestivalPin[] {
  const bounds = view?.bounds;
  const candidates = [...festivals]
    .filter(
      (festival) =>
        festival.eventId === selectedId ||
        !bounds ||
        (festival.lng >= bounds[0] &&
          festival.lat >= bounds[1] &&
          festival.lng <= bounds[2] &&
          festival.lat <= bounds[3]),
    )
    .sort(
      (a, b) =>
        Number(b.eventId === selectedId) - Number(a.eventId === selectedId) ||
        b.peakP50 - a.peakP50,
    );
  const distance = ((view?.width ?? 1000) * 150) / Math.max(320, pixels);
  const pins: FestivalPin[] = [];
  for (const festival of candidates) {
    const point = projectKorea(festival.lng, festival.lat);
    const nearby = pins.find(
      (pin) =>
        Math.hypot(pin.point[0] - point[0], pin.point[1] - point[1]) < distance,
    );
    if (nearby) nearby.count++;
    else if (pins.length < 24) pins.push({ festival, point, count: 1 });
  }
  return pins;
}

// 캔버스와 다른 React 루트를 만들지 않아 지도 이동 중 표식이 사라져도 DOM 충돌이 없다.
export function MapFestivalPins({
  pins,
  selectedId,
  elements,
  onPick,
}: {
  pins: FestivalPin[];
  selectedId: string | null;
  elements: PinElements;
  onPick: (id: string) => void;
}) {
  return (
    <fieldset className="map-festival-pins">
      <legend className="sr-only">지도 위 행사</legend>
      {pins.map(({ festival, count }) => (
        <button
          key={festival.eventId}
          type="button"
          ref={(node) => {
            if (node) elements.current.set(festival.eventId, node);
            else elements.current.delete(festival.eventId);
          }}
          className={`map-festival-pin${selectedId === festival.eventId ? " is-selected" : ""}`}
          data-festival-id={festival.eventId}
          aria-label={`${festival.name} 예보 보기${count > 1 ? ` · 주변 행사 ${count}개` : ""}`}
          aria-pressed={selectedId === festival.eventId}
          title={
            count > 1
              ? `대표 행사: ${festival.name} · 모든 행사는 목록에서 선택할 수 있어요.`
              : festival.name
          }
          onClick={() => onPick(festival.eventId)}
        >
          <span
            className="map-festival-pin__dot"
            style={{ background: `var(--level-${festival.level})` }}
            aria-hidden="true"
          />
          <span className="map-festival-pin__name">
            <small className="map-festival-pin__region">{festival.sigunguName}{count > 1 && festival.eventId !== selectedId ? " · 주변 행사" : " · 축제 위치"}</small>
            {count > 1 && festival.eventId !== selectedId
              ? `${festival.sigunguName} 주변`
              : festival.name}
          </span>
          {count > 1 && festival.eventId !== selectedId && (
            <span className="map-festival-pin__count">{count}</span>
          )}
        </button>
      ))}
    </fieldset>
  );
}
