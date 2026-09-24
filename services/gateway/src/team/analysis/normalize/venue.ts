// 중구만 적힌 장소의 모호성을 감지하고 지역 확정은 동네지기에 남긴다
import type { EventDraft } from "@crowdcast/contracts/types";

// 시도 이름이 없는 중구는 어느 하나로 단정하지 않고 전체 동명 지역을 제시한다
export function normalizeVenue(
  venueText: string | null,
): Pick<EventDraft, "sigunguName" | "sigunguCode" | "ambiguities"> {
  const empty = { sigunguName: null, sigunguCode: null, ambiguities: [] };
  if (!venueText || !/(?:^|\s)중구(?=\s|$)/.test(venueText)) return empty;
  const qualified = venueText.match(
    /(서울|부산|대구|인천|대전|울산)(?:특별시|광역시|시)?\s*중구/,
  );
  if (qualified) return { ...empty, sigunguName: `${qualified[1]} 중구` };
  return {
    ...empty,
    ambiguities: [
      {
        field: "venue",
        candidates: [
          { label: "서울 중구", value: "서울 중구" },
          { label: "부산 중구", value: "부산 중구" },
          { label: "대구 중구", value: "대구 중구" },
          { label: "인천 중구", value: "인천 중구" },
          { label: "대전 중구", value: "대전 중구" },
          { label: "울산 중구", value: "울산 중구" },
        ],
      },
    ],
  };
}
