// 행사 유형 원문을 계약에서 허용한 축제 분류로 정리한다
import common from "@crowdcast/contracts/schemas/common.schema.json";
import type { EventDraft } from "@crowdcast/contracts/types";

// 일반 축제라는 말만으로 기타를 채우지 않고 명시된 주제에만 대응한다
export function normalizeEventType(text: string | null): EventDraft["type"] {
  if (!text) return null;
  if (common.$defs.eventType.enum.includes(text))
    return text as EventDraft["type"];
  if (/불꽃|불빛|불꽃놀이/.test(text)) return "불꽃";
  if (/대학교|대학\s*축제|대동제/.test(text)) return "대학";
  if (/먹거리|음식|푸드|맥주|커피|한우|비빔밥|김치/.test(text)) return "먹거리";
  if (/벚꽃|장미|국화|튤립|꽃\s*축제|유채꽃|수국/.test(text)) return "꽃";
  if (/전통|문화유산|탈춤|단오|민속|한복|국악/.test(text)) return "전통";
  if (/공연|콘서트|음악|재즈|록\s*페스티벌/.test(text)) return "공연";
  if (/기타|체험|박람회|전시|마라톤|걷기|야시장/.test(text)) return "기타";
  return null;
}
