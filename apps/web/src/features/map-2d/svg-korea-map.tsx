// WebGL2가 없는 화면에 시군구 경계와 선택 가능한 행사 점을 SVG로 그린다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { geoMercator, geoPath } from "d3-geo";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { useSelectionStore } from "../../lib/selection-store";

type Region = { sgg: string; sidonm: string; sggnm: string };
type Regions = FeatureCollection<Polygon | MultiPolygon, Region>;

// 같은 좌표의 행사 점은 원형으로 펼쳐 각각 선택할 수 있게 한다.
function markerOffsets(
  festivals: FestivalSummary[],
): Map<string, [number, number]> {
  const groups = new Map<string, FestivalSummary[]>();
  for (const festival of festivals) {
    const key = `${festival.lng},${festival.lat}`;
    groups.set(key, [...(groups.get(key) ?? []), festival]);
  }
  const offsets = new Map<string, [number, number]>();
  for (const group of groups.values()) {
    group.forEach((festival, index) => {
      const angle = (index / group.length) * Math.PI * 2 - Math.PI / 2;
      offsets.set(
        festival.eventId,
        group.length === 1
          ? [0, 0]
          : [Math.cos(angle) * 28, Math.sin(angle) * 28],
      );
    });
  }
  return offsets;
}

// 경계 파일은 3D 판과 같은 공개 파일을 사용한다.
export function SvgKoreaMap({ festivals }: { festivals: FestivalSummary[] }) {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [error, setError] = useState(false);
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const selectedSigungu = useSelectionStore(
    (state) => state.selectedSigunguCode,
  );
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const selectSigungu = useSelectionStore((state) => state.selectSigungu);
  const setFilters = useSelectionStore((state) => state.setFilters);

  // 페이지를 떠나면 경계 요청을 중단한다.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/geo/sigungu.topo.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("경계 없음");
        return response.json();
      })
      .then((data: Topology) => setTopology(data))
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);

  // 전국 범위를 하나의 투영으로 맞춰 경계와 행사 좌표를 같은 축에 둔다.
  const map = useMemo(() => {
    if (!topology) return null;
    const collection = Object.values(topology.objects)[0] as
      | GeometryCollection<Region>
      | undefined;
    if (collection?.type !== "GeometryCollection") return null;
    const regions = feature(topology, collection) as Regions;
    const projection = geoMercator().fitExtent(
      [
        [36, 22],
        [864, 628],
      ],
      regions,
    );
    return { regions, projection, path: geoPath(projection) };
  }, [topology]);
  const offsets = useMemo(() => markerOffsets(festivals), [festivals]);

  // 행사 점과 시군구 영역은 공개 선택 동작을 통해 다른 패널에 전달한다.
  const pick = (festival: FestivalSummary) => {
    selectFestival(festival.eventId);
    selectSigungu(festival.sigunguCode);
  };
  // 지역을 고르면 이전 행사 요약을 지우고 해당 시도의 필터를 맞춘다.
  const pickRegion = (region: Region) => {
    selectFestival(null);
    selectSigungu(region.sgg);
    setFilters({ sido: region.sidonm });
  };
  if (error)
    return (
      <p role="alert">
        지도 경계를 불러오지 못했어요. 행사 목록을 이용해 주세요.
      </p>
    );
  if (!map) return <p role="status">SVG 전국 지도를 불러오는 중이에요.</p>;
  return (
    <div className="svg-korea-map">
      <svg
        viewBox="0 0 900 650"
        role="img"
        aria-label="행사와 시군구를 선택할 수 있는 SVG 전국 지도"
      >
        <g className="svg-korea-map__regions">
          {map.regions.features.map((region) => (
            // biome-ignore lint/a11y/useSemanticElements: SVG 경계는 HTML button을 포함할 수 없다.
            <path
              key={region.properties.sgg}
              d={map.path(region) ?? ""}
              className={
                selectedSigungu === region.properties.sgg ? "is-selected" : ""
              }
              role="button"
              tabIndex={0}
              aria-label={`${region.properties.sidonm} ${region.properties.sggnm} 선택`}
              onClick={() => pickRegion(region.properties)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  pickRegion(region.properties);
                }
              }}
            />
          ))}
        </g>
        <g className="svg-korea-map__events">
          {festivals.map((festival) => {
            const point = map.projection([festival.lng, festival.lat]);
            if (!point) return null;
            const [dx, dy] = offsets.get(festival.eventId) ?? [0, 0];
            return (
              // biome-ignore lint/a11y/useSemanticElements: SVG 행사 점은 HTML button을 포함할 수 없다.
              <g
                key={festival.eventId}
                transform={`translate(${point[0] + dx} ${point[1] + dy})`}
                className={`svg-korea-map__event svg-korea-map__event--${festival.level}${selectedId === festival.eventId ? " is-selected" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${festival.name}, ${festival.level}등급 선택`}
                onClick={() => pick(festival)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    pick(festival);
                  }
                }}
              >
                <circle r="12" />
                <text textAnchor="middle" dominantBaseline="central">
                  {["✓", "!", "▲", "◆"][festival.level - 1]}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <p>지도 점은 행사 위치 · 등급은 아이콘과 목록 글자로 확인해 주세요.</p>
    </div>
  );
}
