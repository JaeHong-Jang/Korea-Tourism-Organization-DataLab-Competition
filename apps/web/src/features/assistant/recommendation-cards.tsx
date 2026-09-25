// 방문객 추천을 계약의 행사 수치와 이유 그대로 카드에 표시한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import {
  CalendarDays,
  Flower2,
  GraduationCap,
  Landmark,
  type LucideIcon,
  Music2,
  Sparkles,
  Utensils,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LevelBadge } from "../../components/common/level-badge";
import { useAssistantStore } from "../../lib/consult-store";
import { formatDate, formatPeople } from "../../lib/format";
import { useSelectionStore } from "../../lib/selection-store";
import type { Recommendation } from "../consult-chat/use-consult-session";

const labels = ["소규모", "수립 권고", "수립 대상", "대규모"] as const;
const typeIcons: Record<FestivalSummary["type"], LucideIcon> = {
  불꽃: Sparkles,
  공연: Music2,
  대학: GraduationCap,
  먹거리: Utensils,
  꽃: Flower2,
  전통: Landmark,
  기타: CalendarDays,
};

// 대표 이미지가 없으면 행사 유형을 뜻하는 그림을 보여 준다.
export function FestivalImage({ festival }: { festival: FestivalSummary }) {
  const Icon = typeIcons[festival.type];
  return (
    <div className="assistant-recommendation__image">
      {festival.image ? (
        <img src={festival.image.url} alt="" />
      ) : (
        <Icon aria-hidden="true" size={38} strokeWidth={1.5} />
      )}
    </div>
  );
}

// 지도 버튼은 S1 선택 스토어를 갱신하고 주최자 버튼은 같은 행사로 예보를 요청한다.
export function RecommendationCards({
  recommendation,
  onChangeConditions,
}: {
  recommendation: Recommendation;
  onChangeConditions: () => void;
}) {
  const navigate = useNavigate();
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const selectSigungu = useSelectionStore((state) => state.selectSigungu);
  const chooseFestival = useAssistantStore((state) => state.chooseFestival);
  const closePanel = useAssistantStore((state) => state.closePanel);
  const openMap = (festival: FestivalSummary) => {
    selectFestival(festival.eventId);
    selectSigungu(festival.sigunguCode);
    closePanel();
    navigate("/");
  };
  return (
    <section className="assistant-recommendations" aria-label="추천 행사">
      <h3>조건에 맞는 행사</h3>
      {recommendation.items.length ? (
        <ol>
          {recommendation.items.map(({ summary, reason }) => (
            <li key={summary.eventId} className="assistant-recommendation">
              <FestivalImage festival={summary} />
              <div>
                <strong>{summary.name}</strong>
                <p>
                  {formatDate(summary.startsAt)} · {summary.sigunguName}
                </p>
                <LevelBadge
                  judgment={{
                    level: summary.level,
                    label: labels[summary.level - 1],
                  }}
                  provisional={summary.ood}
                />
                <p>
                  순간 최대 {formatPeople(summary.peakP10)}~
                  {formatPeople(summary.peakP90)} · 추정
                </p>
                <p>{reason}</p>
                {summary.image && <small>{summary.image.credit}</small>}
                <div className="assistant-recommendation__actions">
                  <button type="button" onClick={() => openMap(summary)}>
                    지도에서 보기
                  </button>
                  <button type="button" onClick={() => chooseFestival(summary)}>
                    이 행사 예보 받기
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <p>{recommendation.note}</p>
          <button type="button" onClick={onChangeConditions}>
            조건 바꾸기
          </button>
        </>
      )}
      {recommendation.items.length > 0 && (
        <p className="consult-muted">{recommendation.note}</p>
      )}
    </section>
  );
}
