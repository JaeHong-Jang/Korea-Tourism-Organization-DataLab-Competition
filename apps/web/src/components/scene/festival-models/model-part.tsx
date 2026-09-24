// 행사 모형을 재료별 병합에 쓰는 저폴리 조각으로 정의한다.
export type ModelPart = {
  kind: "block" | "spire";
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  rotation?: [number, number, number];
};

// 사각 조각의 크기와 재료를 데이터로 보관한다.
export function block(
  position: ModelPart["position"],
  scale: ModelPart["scale"],
  color: string,
  rotation?: ModelPart["rotation"],
): ModelPart {
  return { kind: "block", position, scale, color, rotation };
}

// 원뿔 조각의 밑면 반경·높이·분할 수를 데이터로 보관한다.
export function spire(
  position: ModelPart["position"],
  scale: ModelPart["scale"],
  color: string,
): ModelPart {
  return { kind: "spire", position, scale, color };
}
