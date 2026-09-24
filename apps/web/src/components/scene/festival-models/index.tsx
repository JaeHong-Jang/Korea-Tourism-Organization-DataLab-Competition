// 행사 유형을 일곱 가지 저폴리 모형과 등급 깃발로 연결한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import type { ComponentType } from "react";
import { LAND_BASE_Y } from "../scene-height";
import { FireworksModel } from "./fireworks-model";
import { FlowerModel } from "./flower-model";
import { FoodModel } from "./food-model";
import { GradeFlag } from "./grade-flag";
import { OtherModel } from "./other-model";
import { PerformanceModel } from "./performance-model";
import type { PlacedFestival } from "./placement";
import { TraditionModel } from "./tradition-model";
import { UniversityModel } from "./university-model";

const models: Record<FestivalSummary["type"], ComponentType> = {
  불꽃: FireworksModel,
  공연: PerformanceModel,
  먹거리: FoodModel,
  꽃: FlowerModel,
  대학: UniversityModel,
  전통: TraditionModel,
  기타: OtherModel,
};

// 계약의 모든 유형에 고유 모형이 있는지 테스트에서 확인한다.
export function modelForType(type: FestivalSummary["type"]): ComponentType {
  return models[type];
}

// 행사별 모형 위치를 같은 축척으로 고정하고 깃발을 함께 세운다.
export function FestivalModels({ placed }: { placed: PlacedFestival[] }) {
  return (
    <group>
      {placed.map(({ festival, x, z }) => {
        const Model = modelForType(festival.type);
        return (
          <group key={festival.eventId} position={[x, LAND_BASE_Y, z]}>
            <Model />
            <GradeFlag level={festival.level} />
          </group>
        );
      })}
    </group>
  );
}
