// Canvas를 쓸 수 없어도 행사 이름·지역·등급을 키보드로 볼 수 있다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useState } from "react";
import { GradeMark } from "./grade-mark";

// 목록 버튼은 향후 T-433 행사 패널과 합쳐질 접근성 진입점이다.
export function FestivalList({ festivals }: { festivals: FestivalSummary[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="scene-list-control">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="scene-festival-list"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "목록 닫기" : "목록으로 보기"}
      </button>
      {open && (
        <ol
          id="scene-festival-list"
          className="scene-festival-list"
          aria-label="장면의 견본 행사"
        >
          {festivals.map((festival) => (
            <li key={festival.eventId}>
              {festival.name}, {festival.sigunguName},{" "}
              <GradeMark level={festival.level} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
