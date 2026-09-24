// 기록관의 자료 표식을 단 분석팀 펫을 그린다.
import { PetBody, type PetCharacterProps } from "./pet-body";

// 역할 표식과 팀 색을 공통 펫 몸통에 입힌다.
export function Archivist({ state, size }: PetCharacterProps) {
  return <PetBody team="analysis" state={state} size={size} mark="▤" />;
}
