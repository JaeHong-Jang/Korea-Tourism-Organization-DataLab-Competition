// 확대 지점의 도로와 공원만 기존 땅 위에 얹고 별도 받침판은 만들지 않는다.
import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { sceneColor } from "../quality";
import { areaGeometry, stripGeometry } from "../venue/ground-geometry";
import type { VenueTiles } from "../venue/tiles";

export function MapDetailGround({ tiles }: { tiles: VenueTiles }) {
  const geometries = useMemo(
    () => ({
      roads: stripGeometry(tiles.roads, 0.8),
      park: areaGeometry(tiles.areas, "park"),
      water: areaGeometry(tiles.areas, "water"),
    }),
    [tiles],
  );
  useEffect(
    () => () => {
      Object.values(geometries).forEach((item) => {
        item?.dispose();
      });
    },
    [geometries],
  );
  return (
    <>
      <mesh geometry={geometries.roads}>
        <meshStandardMaterial color="#777b80" side={DoubleSide} />
      </mesh>
      {geometries.park && (
        <mesh geometry={geometries.park}>
          <meshStandardMaterial
            color={sceneColor("city-park")}
            side={DoubleSide}
          />
        </mesh>
      )}
      {geometries.water && (
        <mesh geometry={geometries.water}>
          <meshStandardMaterial
            color={sceneColor("city-water")}
            side={DoubleSide}
          />
        </mesh>
      )}
    </>
  );
}
