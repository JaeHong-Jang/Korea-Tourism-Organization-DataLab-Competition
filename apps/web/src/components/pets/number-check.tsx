// 숫자대조의 숫자 표식을 단 검증팀 펫을 그린다.
import { PetBody, type PetCharacterProps } from "./pet-body";

// 역할 표식과 팀 색을 공통 펫 몸통에 입힌다.
export function NumberCheck({ state, size }: PetCharacterProps) {
  return <PetBody team="verification" state={state} size={size} mark="#" />;
}
