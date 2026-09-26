// 전국 바탕 지도(실제 토지 피복·호수·도로)를 땅 위 평면 한 묶음과 도로 띠 한 묶음으로 그린다.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  type Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Path,
  Shape,
  ShapeGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FAR_HEIGHT } from "../city-clusters";
import { sceneColor } from "../quality";
import { LAND_SURFACE_Y } from "../scene-height";
import type { BaseArea, BaseLine, Basemap } from "./national-basemap";

// 외곽선과 구멍으로 평면 형상을 만들고 한 색으로 칠해 높이 y에 눕힌다.
function areaGeometry(area: BaseArea, color: Color, y: number) {
  const toShape = <T extends Shape | Path>(
    target: T,
    ring: [number, number][],
  ) => {
    ring.forEach(([x, z], index) => {
      if (index) target.lineTo(x, -z);
      else target.moveTo(x, -z);
    });
    return target;
  };
  const shape = toShape(new Shape(), area.rings[0]);
  shape.holes = area.rings.slice(1).map((ring) => toShape(new Path(), ring));
  const geometry = new ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  geometry.deleteAttribute("uv");
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++)
    colors.set([color.r, color.g, color.b], index * 3);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

// 도로 선분마다 폭 2×half의 납작한 사각형을 한 색으로 적는다.
function roadGeometry(roads: BaseLine[], color: Color, half: number) {
  const positions: number[] = [];
  const colors: number[] = [];
  const y = LAND_SURFACE_Y + 0.08;
  for (const road of roads)
    for (let index = 1; index < road.points.length; index++) {
      const [ax, az] = road.points[index - 1];
      const [bx, bz] = road.points[index];
      const length = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / length) * half;
      const nz = ((bx - ax) / length) * half;
      positions.push(
        ...[ax - nx, y, az - nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz],
        ...[ax - nx, y, az - nz, ax + nx, y, az + nz, bx + nx, y, bz + nz],
      );
      for (let corner = 0; corner < 6; corner++)
        colors.push(color.r, color.g, color.b);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

export function BasemapLayer({ basemap }: { basemap: Basemap }) {
  // 땅 피복(도시·숲·농지·풀밭) 위에 호수를 얹는다 — 모두 한 형상.
  const areas = useMemo(() => {
    const colors: Record<string, Color> = {
      urban: new Color(sceneColor("cover-urban")),
      forest: new Color(sceneColor("cover-forest")),
      farm: new Color(sceneColor("cover-farm")),
      grass: new Color(sceneColor("cover-grass")),
      water: new Color(sceneColor("river")),
    };
    const pieces = [
      ...basemap.areas.map((area) =>
        areaGeometry(
          area,
          colors[area.kind] ?? colors.grass,
          LAND_SURFACE_Y + 0.03,
        ),
      ),
      ...basemap.water.map((area) =>
        areaGeometry(area, colors.water, LAND_SURFACE_Y + 0.06),
      ),
    ];
    const merged = pieces.length ? mergeGeometries(pieces, false) : null;
    for (const piece of pieces) piece.dispose();
    return merged;
  }, [basemap]);
  // 고속도로(폭 0.6km, 흰색)·주요 도로(0.35km, 밝은 회색)를 선분마다 얇은 사각형(삼각형 둘)으로 눕힌다 — 종류별 한 묶음.
  const [highways, majors] = useMemo(
    () =>
      (["highway", "major_road"] as const).map((kind) =>
        roadGeometry(
          basemap.roads.filter((road) => road.kind === kind),
          new Color(
            sceneColor(kind === "highway" ? "map-highway" : "map-road"),
          ),
          kind === "highway" ? 0.3 : 0.175,
        ),
      ),
    [basemap],
  );
  // 멀리서(카메라 높이 320 위)는 주요 도로가 실보다 가늘어 그리지 않는다(프레임 절약).
  const major = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (major.current) major.current.visible = camera.position.y <= FAR_HEIGHT;
  });
  const roadMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        vertexColors: true,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    [],
  );
  // 땅 윗면과 같은 높이 근처라 깊이 오프셋으로 늘 위에 그린다.
  const material = useMemo(
    () =>
      new MeshLambertMaterial({
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  );
  useEffect(
    () => () => {
      areas?.dispose();
      highways.dispose();
      majors.dispose();
    },
    [areas, highways, majors],
  );
  useEffect(
    () => () => {
      material.dispose();
      roadMaterial.dispose();
    },
    [material, roadMaterial],
  );
  return (
    <>
      {areas && <mesh geometry={areas} material={material} />}
      <mesh geometry={highways} material={roadMaterial} />
      <mesh ref={major} geometry={majors} material={roadMaterial} />
    </>
  );
}
