/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 받아쓰기가 만든 정규화 전·후 초안. 빠진 값과 모호한 값을 함께 담는다
 */
export interface EventDraft {
  name: string | null;
  type: ("불꽃" | "공연" | "대학" | "먹거리" | "꽃" | "전통" | "기타") | null;
  startsAt: string | null;
  endsAt: string | null;
  timeOfDay: ("주간" | "야간" | "종일") | null;
  venueText: string | null;
  sigunguCode: string | null;
  sigunguName?: string | null;
  fee: ("무료" | "유료" | "미상") | null;
  hostType: ("지자체" | "민간" | "대학" | "기타") | null;
  budgetKrw?: number | null;
  promo: string[];
  hazards: (
    "폭죽" | "불" | "가연성가스" | "석유류" | "산" | "수면" | "차량진입" | "단일출입구" | "무대밀집" | "야간조명부족"
  )[];
  /**
   * 코드가 계산한 빠진 필수·선택 값
   */
  missing: ("name" | "type" | "startsAt" | "endsAt" | "venue" | "fee" | "budgetKrw")[];
  ambiguities: {
    field: string;
    /**
     * @minItems 2
     */
    candidates: [
      {
        label: string;
        value: string;
      },
      {
        label: string;
        value: string;
      },
      ...{
        label: string;
        value: string;
      }[]
    ];
  }[];
}
