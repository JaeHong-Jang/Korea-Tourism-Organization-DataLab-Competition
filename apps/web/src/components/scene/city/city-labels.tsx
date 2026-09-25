// 동네 3D 위에 행사 카드(사진·이름·등급·예상 인원)와 가까운 역 이름표를 띄운다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { Html } from "@react-three/drei";
import { TrainFront } from "lucide-react";
import { formatDate, formatPeople } from "../../../lib/format";
import { GradeMark } from "../grade-mark";
import type { VenueStation } from "../venue/tiles";

// 역 이름은 행사장에 가까운 것부터 최대 여섯 개만 보인다.
export function CityLabels({
  festival,
  stations,
}: {
  festival: FestivalSummary;
  stations: VenueStation[];
}) {
  const nearest = [...stations]
    .sort((a, b) => Math.hypot(...a.point) - Math.hypot(...b.point))
    .filter(
      (station, index, list) =>
        list.findIndex((item) => item.name === station.name) === index,
    )
    .slice(0, 6);
  return (
    <>
      <Html position={[0, 140, 0]} center zIndexRange={[30, 0]}>
        <article
          className="city-card"
          aria-label={`${festival.name} 행사 카드`}
        >
          {festival.image?.url && (
            <img src={festival.image.url} alt="" className="city-card__photo" />
          )}
          <div className="city-card__body">
            <span className="city-card__meta">
              {festival.type} · {formatDate(festival.startsAt)}
            </span>
            <strong>{festival.name}</strong>
            <span className="city-card__meta">
              <GradeMark level={festival.level} /> · 순간 최대 약{" "}
              {formatPeople(festival.peakP50)}
            </span>
            {festival.coordSource !== "venue" && (
              <span className="city-card__note">
                행사장 좌표 확인 전 · {festival.sigunguName} 중심 동네
              </span>
            )}
          </div>
        </article>
      </Html>
      <Html position={[0, 18, 0]} center zIndexRange={[29, 0]}>
        <span className="city-pin" aria-hidden="true" />
      </Html>
      {nearest.map((station) => (
        <Html
          key={station.name}
          position={[station.point[0], 26, station.point[1]]}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span className="city-station">
            <TrainFront size={12} aria-hidden="true" />
            {station.name}
          </span>
        </Html>
      ))}
    </>
  );
}
