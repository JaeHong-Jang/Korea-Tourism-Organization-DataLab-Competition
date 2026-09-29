// 이전 부스·무대·관람객을 실제 고도에 맞춰 배치하고 낮밤 조명을 연결한다.
import { useEffect, useMemo } from "react";
import { FestivalCrowd } from "../../../../features/regional-diorama/festival-crowd";
import { festivalDecorationGeometry } from "../../../../features/regional-diorama/festival-decoration-geometry";
import { Confetti } from "../../../../features/regional-diorama/festival-props";
import { LAND_SURFACE_Y } from "../../scene-height";
import type { MapPoint } from "../types";
import type { createFestivalSite } from "./festival-site";
import { FestivalLights, FestivalFireworks } from "./festival-lights";
const ORIGIN: MapPoint = [0, 0];

// 시설은 하나의 메시로 합치고 불꽃 유형·공연 유형에서만 무대 색종이를 사용한다.
export function FestivalScene({
  site,
  center,
  reduced,
  night,
  type,
  limit,
}: {
  site: ReturnType<typeof createFestivalSite>;
  center: MapPoint;
  reduced: boolean;
  night: boolean;
  type: string;
  limit: number;
}) {
  const geometry = useMemo(
    () => festivalDecorationGeometry(site.props),
    [site],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return (
    <group
      name="city-festival-site"
      position={[center[0], LAND_SURFACE_Y + 0.0012, center[1]]}
      scale={0.001}
      userData={{ facilities: site.props.length, site }}
    >
      {geometry && (
        <mesh geometry={geometry}>
          <meshLambertMaterial
            vertexColors
            emissive={night ? "#b58b52" : "#000000"}
            emissiveIntensity={night ? 0.3 : 0}
          />
        </mesh>
      )}
      <FestivalCrowd
        tiles={site.crowdTiles}
        center={ORIGIN}
        reducedMotion={reduced}
        heightAt={site.heightAt}
        allowed={site.allowed}
        goals={site.goals}
        limit={limit}
      />
      {site.props
        .filter((p) => p.stage)
        .map((p) => (
          <group key={`${p.x},${p.z}`} position={[p.x, p.y ?? 0, p.z]}>
            {["공연", "불꽃"].includes(type) && (
              <Confetti reducedMotion={reduced} />
            )}
            {night && (
              <mesh position={[0, 15, 0]}>
                <boxGeometry args={[24, 0.8, 0.8]} />
                <meshBasicMaterial color="#ffe39a" />
              </mesh>
            )}
          </group>
        ))}
      {night && site.props.length > 0 && <FestivalLights props={site.props} />}
      {night && !reduced && type === "불꽃" && site.props.length > 0 && (
        <FestivalFireworks height={site.heightAt(0, 0)} />
      )}
    </group>
  );
}
