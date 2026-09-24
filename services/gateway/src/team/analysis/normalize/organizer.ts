// 명시된 행사 주최자를 계약의 주최 유형으로 정규화한다
import type { EventDraft } from "@crowdcast/contracts/types";

// 행사 장소나 이름을 주최자로 추측하지 않고 주최 원문만 분류한다
export function normalizeHost(text: string | null): EventDraft["hostType"] {
  if (!text || /미정|미상|아직|추후/.test(text)) return null;
  if (/대학|총학생회/.test(text)) return "대학";
  if (
    /지자체|시청|구청|군청|도청|특별시|광역시|[가-힣]+[시군구](?:\s*주최|$)/.test(
      text,
    )
  )
    return "지자체";
  if (/민간|기업|주식회사|상인회|기획사|협회/.test(text)) return "민간";
  if (/기타/.test(text)) return "기타";
  return null;
}
