// 해설가의 말 표식을 단 보고팀 펫을 그린다.
import { PetBody, type PetCharacterProps } from "./pet-body";

// 역할 표식과 팀 색을 공통 펫 몸통에 입힌다.
export function Explainer({ state, size }: PetCharacterProps) {
  return <PetBody team="report" state={state} size={size} mark="“" />;
}
