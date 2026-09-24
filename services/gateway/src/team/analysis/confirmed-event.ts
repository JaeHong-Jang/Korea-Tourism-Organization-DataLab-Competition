// 초안과 서비스가 확인한 좌표로 필수 계약을 갖춘 행사를 만든다
import type { EventDraft } from "@crowdcast/contracts/types";
import type { GeocodeCandidate } from "../../clients/geocode-schema.js";
import { responseSchema } from "../../contract/responses.js";

// 시도는 표준 시군구 코드의 앞 두 자리로 결정하고 알 수 없는 코드는 거부한다
const sidoNames: Record<string, string> = {
  "11": "서울특별시",
  "26": "부산광역시",
  "27": "대구광역시",
  "28": "인천광역시",
  "29": "광주광역시",
  "30": "대전광역시",
  "31": "울산광역시",
  "36": "세종특별자치시",
  "41": "경기도",
  "42": "강원도",
  "43": "충청북도",
  "44": "충청남도",
  "45": "전라북도",
  "46": "전라남도",
  "47": "경상북도",
  "48": "경상남도",
  "50": "제주특별자치도",
  "51": "강원특별자치도",
  "52": "전북특별자치도",
};
const validate = responseSchema("event");

// 값이 빠졌을 때 이름·주최자·시각을 추측해 채우지 않는다
export function confirmedEvent(
  sessionId: string,
  draft: EventDraft,
  place: GeocodeCandidate,
) {
  const event: unknown = {
    id: `e-${sessionId.slice(2)}`,
    name: draft.name,
    type: draft.type,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    timeOfDay: draft.timeOfDay,
    venue: { name: draft.venueText, lat: place.lat, lng: place.lng },
    sido: sidoNames[place.sigunguCode.slice(0, 2)],
    sigunguCode: place.sigunguCode,
    sigunguName: place.sigunguName,
    fee: draft.fee,
    hostType: draft.hostType,
    budgetKrw: draft.budgetKrw,
    edition: null,
    promo: draft.promo,
    hazards: draft.hazards,
    expectedByHost: null,
    source: "사용자입력",
  };
  if (!validate(event)) throw new Error("확정 행사 계약 위반");
  return event;
}
