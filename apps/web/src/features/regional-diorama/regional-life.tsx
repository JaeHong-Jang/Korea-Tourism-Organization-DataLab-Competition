// 성남처럼 공개 지도 도로를 따라 작은 사람과 차량을 움직이는 장면을 만든다.
import { useMemo } from "react";
import { CityPeople } from "../../components/scene/city/city-people";
import { CityTraffic } from "../../components/scene/city/city-traffic";
import { graphRoutes, routeGraph } from "../../components/scene/venue/routes";
import type { VenueTiles } from "../../components/scene/venue/tiles";
import { FestivalCrowd } from "./festival-crowd";
import { festivalLayout } from "./festival-layout";
import { FestivalProps } from "./festival-props";

export function RegionalLife({
  tiles,
  reducedMotion,
  festivalCenter,
}: {
  tiles: VenueTiles;
  reducedMotion: boolean;
  festivalCenter: [number, number] | null;
}) {
  const layout = useMemo(
    () => (festivalCenter ? festivalLayout(tiles, festivalCenter) : null),
    [tiles, festivalCenter?.[0], festivalCenter?.[1]],
  );
  const roads = useMemo(
    () =>
      graphRoutes(
        routeGraph(
          tiles.roads.filter(
            (line) =>
              line.kind !== "path" &&
              Math.hypot(
                (line.from[0] + line.to[0]) / 2,
                (line.from[1] + line.to[1]) / 2,
              ) < 850,
          ),
        ),
        90,
        1200,
      ),
    [tiles],
  );
  const walks = useMemo(
    () =>
      graphRoutes(
        routeGraph(tiles.roads.filter((line) => line.kind !== "major_road")),
        110,
        800,
      ),
    [tiles],
  );
  return (
    <>
      {layout && (
        <FestivalProps props={layout.props} reducedMotion={reducedMotion} />
      )}
      {festivalCenter && layout && (
        <FestivalCrowd
          tiles={layout.crowdTiles}
          center={festivalCenter}
          reducedMotion={reducedMotion}
        />
      )}
      <CityPeople
        routes={walks}
        walkers={220}
        gather={0}
        towardShare={0}
        quality="medium"
        reducedMotion={reducedMotion}
      />
      <CityTraffic
        roadRoutes={roads}
        railRoutes={[]}
        quality="medium"
        hour={14}
        eventHour={18}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
