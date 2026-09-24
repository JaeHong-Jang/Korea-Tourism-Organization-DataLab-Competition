// 지휘가 팀의 흐름을 잡는 지휘봉 펫을 그린다.
import { PetBody, type PetCharacterProps } from "./pet-body";

// 역할 표식과 팀 색을 공통 펫 몸통에 입힌다.
export function Lead({ state, size }: PetCharacterProps) {
  return <PetBody team="lead" state={state} size={size} mark="↗" baton />;
}
