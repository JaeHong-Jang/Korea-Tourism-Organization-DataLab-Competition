// 일괄 예보의 검증 한계와 견본 여부를 장면 범례 옆에 밝힌다.
import type { FestivalSummary } from "@crowdcast/contracts/types";

// 검증 상태가 응답에 명시된 경우에만 골든 사례 고지를 보인다.
export function HonestNotices({
  festivals,
  fixture,
}: {
  festivals: FestivalSummary[];
  fixture: boolean;
}) {
  return (
    <div className="scene-honest-notices">
      {festivals.some((festival) => festival.modelVerdict === "미검증") && (
        <p>골든 사례 0건 — 사례 재현 검증 전 임시 사용</p>
      )}
      <p>학습 자료가 큰 행사 위주라 작은 행사는 크게 예보될 수 있어요</p>
      {fixture && <p>견본 데이터</p>}
    </div>
  );
}
