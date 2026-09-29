// 카메라 범위의 도시 활동을 유지하며 지도 갱신과 객체의 이동 수명을 분리한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { useTheme } from "../../../../lib/theme/theme-provider";
import type { LandModel } from "../../land-tiles";
import type { SceneQuality } from "../../quality";
import type { MapPoint, MapTile, MapViewport } from "../types";
import { activityCaps, activityWindow, inWindow } from "./window";
import { useActivityNetwork } from "./use-activity-network";
import { ActivitySimulation } from "./simulation";
import { ActivityVehicles } from "./vehicles";
import { ActivityPeople } from "./people";
import { ActivityTrains, TransportFleet } from "./transports";
import { transportNetworks } from "./transport-routes";
import { createFestivalSite } from "./festival-site";
import { FestivalScene } from "./festival-scene";
import { countryContains } from "../country-boundary";
import { applyActivityRenderLayer } from "./render-layer";
const EMPTY: MapTile = { roads: [], buildings: [], areas: [], places: [] };

// 같은 객체는 카메라가 움직여도 유지하고 지도별 캐시는 세 행사로 제한한다.
export function CityActivity({
  data = EMPTY,
  view,
  model,
  quality,
  reduced,
  festival,
  selected,
}: {
  data?: MapTile;
  view: MapViewport;
  model: LandModel;
  quality: SceneQuality;
  reduced: boolean;
  festival?: FestivalSummary;
  selected: MapPoint | null;
}) {
  const { sky } = useTheme(),
    { invalidate, size } = useThree();
  const layer = useRef<Group>(null);
  // 시설·테마가 바뀐 React 커밋에서만 적용하고 매 프레임 장면을 탐색하지 않는다.
  useLayoutEffect(() => {
    if (layer.current) applyActivityRenderLayer(layer.current);
  });
  const simulations = useMemo(
    () => ({
      cars: new ActivitySimulation("car"),
      people: new ActivitySimulation("walk"),
      trains: new ActivitySimulation("rail"),
      air: new ActivitySimulation("rail", 5),
      sea: new ActivitySimulation("rail", 0.4),
    }),
    [],
  );
  const window = useMemo(() => activityWindow(view), [view]);
  const networks = useActivityNetwork(data, window, view.zoom >= 13);
  const transport = useMemo(() => transportNetworks(model), [model]);
  const land = useMemo(() => countryContains(model), [model]);
  const diagnostic = useMemo(
    () => new URLSearchParams(location.search).get("sceneDiagnostic") === "1",
    [],
  );
  const caps = activityCaps(view.width, quality, size.width * size.height);
  const siteCache = useRef(
    new Map<string, ReturnType<typeof createFestivalSite>>(),
  );
  const site = useMemo(() => {
    if (!festival || !selected || view.zoom < 13 || !inWindow(selected, window))
      return null;
    const existing = siteCache.current.get(festival.eventId);
    if (existing) return existing;
    if (
      !data.roads.some((r) =>
        r.points.some(
          (p) => Math.hypot(p[0] - selected[0], p[1] - selected[1]) < 0.7,
        ),
      ) &&
      !data.buildings.some((b) =>
        b.polygons.some((r) =>
          r[0].some(
            (p) => Math.hypot(p[0] - selected[0], p[1] - selected[1]) < 0.7,
          ),
        ),
      )
    )
      return null;
    const created = createFestivalSite(
      data,
      selected,
      festival.type,
      model.elevation,
      land,
    );
    siteCache.current.set(festival.eventId, created);
    while (siteCache.current.size > 3)
      siteCache.current.delete(siteCache.current.keys().next().value!);
    return created;
  }, [data, festival, selected, view.zoom, window, model, land]);
  useEffect(() => {
    simulations.cars.update(networks.cars);
    simulations.people.update(networks.people);
    simulations.trains.update(networks.trains);
    simulations.air.update(transport.air);
    simulations.sea.update(transport.sea);
    invalidate();
  }, [simulations, networks, transport, invalidate]);
  const lastTick = useRef(0);
  // 이동 객체가 있는 화면만 30Hz로 깨우고 비활성 탭은 타이머를 정지한다.
  useEffect(() => {
    let timer: ReturnType<typeof globalThis.setInterval> | undefined;
    const start = () => {
      globalThis.clearInterval(timer);
      if (!reduced && !document.hidden && view.width < 1200)
        timer = globalThis.setInterval(() => invalidate(), 1000 / 30);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      globalThis.clearInterval(timer);
      document.removeEventListener("visibilitychange", start);
    };
  }, [reduced, invalidate, view.width < 1200]);
  useFrame((_, delta) => {
    if (document.hidden) return;
    lastTick.current += delta;
    if (lastTick.current > 0.2 || reduced) {
      lastTick.current = 0;
      simulations.cars.populate(window, caps.cars, reduced ? caps.cars : 8);
      simulations.people.populate(
        window,
        caps.people,
        reduced ? caps.people : 22,
      );
      simulations.trains.populate(
        window,
        caps.trains,
        reduced ? caps.trains : 2,
      );
      simulations.air.populate(
        window,
        view.width < 1200
          ? Math.min(6, Math.max(1, Math.round(view.width / 70)))
          : 0,
        1,
      );
      simulations.sea.populate(
        window,
        view.width < 500
          ? Math.min(10, Math.max(2, Math.round(view.width / 20)))
          : 0,
        1,
      );
    }
    for (const simulation of Object.values(simulations)) {
      if (reduced) {
        for (const actor of simulation.actors) actor.fade = 1;
      } else simulation.step(delta);
    }
    if (diagnostic && lastTick.current === 0)
      document.documentElement.dataset.cityActivity = JSON.stringify({
        cars: simulations.cars.actors.length,
        people: simulations.people.actors.length,
        trains: simulations.trains.actors.length,
        planes: simulations.air.actors.length,
        ships: simulations.sea.actors.length,
        facilities: site?.props.length ?? 0,
      });
  }, -1);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.cityActivity;
    },
    [],
  );
  return (
    <group
      ref={layer}
      name="city-activity"
      renderOrder={5}
      userData={{ simulations, window, land, elevation: model.elevation }}
    >
      <ActivityVehicles
        simulation={simulations.cars}
        elevation={model.elevation}
        detail={view.width < 4}
        night={sky !== "day"}
      />
      <ActivityPeople
        simulation={simulations.people}
        elevation={model.elevation}
        reduced={reduced}
      />
      <ActivityTrains
        simulation={simulations.trains}
        elevation={model.elevation}
      />
      <TransportFleet
        simulation={simulations.air}
        kind="air"
        elevation={model.elevation}
        scale={Math.max(1, Math.min(12, view.width / 40))}
      />
      <TransportFleet
        simulation={simulations.sea}
        kind="sea"
        scale={Math.max(1, Math.min(8, view.width / 30))}
      />
      {site && selected && festival && (
        <FestivalScene
          key={festival.eventId}
          site={site}
          center={selected}
          type={festival.type}
          reduced={reduced}
          night={sky !== "day"}
          limit={quality === "low" ? 100 : quality === "medium" ? 240 : 360}
        />
      )}
    </group>
  );
}
