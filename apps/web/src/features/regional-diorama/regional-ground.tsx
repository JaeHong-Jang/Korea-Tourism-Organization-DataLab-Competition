// 성남 화면의 차분한 지면·회색 도로·파스텔 녹지와 수면을 별도 받침판 없이 배치한다.
import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import {
  areaGeometry,
  stripGeometry,
} from "../../components/scene/venue/ground-geometry";
import type { VenueTiles } from "../../components/scene/venue/tiles";

export function RegionalGround({ tiles }: { tiles: VenueTiles }) {
  const parts = useMemo(
    () => [
      {
        geometry: stripGeometry(
          tiles.roads.filter((road) => road.kind !== "path"),
          0.8,
          2400,
        ),
        color: "#697274",
      },
      {
        geometry: stripGeometry(
          tiles.roads.filter((road) => road.kind === "path"),
          0.9,
          2400,
        ),
        color: "#c0ad88",
      },
      { geometry: areaGeometry(tiles.areas, "park", 2400), color: "#a6bc90" },
      { geometry: areaGeometry(tiles.areas, "water", 2400), color: "#83b8bf" },
    ],
    [tiles],
  );
  useEffect(
    () => () => {
      for (const part of parts) part.geometry?.dispose();
    },
    [parts],
  );
  return (
    <>
      {parts.map(
        ({ geometry, color }) =>
          geometry && (
            <mesh key={color} geometry={geometry} receiveShadow>
              <meshLambertMaterial color={color} side={DoubleSide} />
            </mesh>
          ),
      )}
    </>
  );
}
