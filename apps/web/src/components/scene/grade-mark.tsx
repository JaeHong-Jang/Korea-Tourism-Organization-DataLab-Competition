// 등급을 색에 의존하지 않는 아이콘과 글자로 표시한다.
import { CircleCheck, ShieldAlert, Siren, TriangleAlert } from "lucide-react";

const grades = [
  { label: "소규모", Icon: CircleCheck },
  { label: "수립 권고", Icon: TriangleAlert },
  { label: "수립 대상", Icon: ShieldAlert },
  { label: "대규모", Icon: Siren },
] as const;

// 계약 등급 범위를 벗어난 값은 가장 보수적인 마지막 등급으로 표시한다.
export function GradeMark({ level }: { level: number }) {
  const grade = grades[level - 1] ?? grades[3];
  return (
    <span className="scene-grade">
      <grade.Icon size={13} aria-hidden="true" />
      <span>{grade.label}</span>
    </span>
  );
}
