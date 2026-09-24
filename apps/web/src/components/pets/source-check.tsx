// 출처확인의 탐색 표식을 단 검증팀 펫을 그린다.
import { PetBody, type PetCharacterProps } from "./pet-body";

// 역할 표식과 팀 색을 공통 펫 몸통에 입힌다.
export function SourceCheck({ state, size }: PetCharacterProps) {
  return <PetBody team="verification" state={state} size={size} mark="⌕" />;
}
