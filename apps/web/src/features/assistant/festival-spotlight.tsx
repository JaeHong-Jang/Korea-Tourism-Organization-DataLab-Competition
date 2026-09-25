// 지도·목록에서 고른 행사를 고래 옆 말풍선 카드로 보여 준다 — 목록 아래 중복 요약 대신.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { FestivalSummaryPanel } from "../mini-korea/festival-summary";
import { FestivalImage } from "./recommendation-cards";

// 사진·예보 요약·예보 받기 링크에 고래에게 묻기와 닫기를 붙인다.
export function FestivalSpotlight({
  festival,
  onTalk,
  onClose,
}: {
  festival: FestivalSummary;
  onTalk: () => void;
  onClose: () => void;
}) {
  return (
    <div className="assistant-invitation assistant-spotlight">
      <button
        type="button"
        className="assistant-invitation__close"
        onClick={onClose}
        aria-label="행사 카드 닫기"
      >
        ×
      </button>
      <p className="assistant-spotlight__from">
        <img src="/assistant/whale.png" alt="" width={24} height={21} />
        고래 봇 · 고른 행사
      </p>
      {festival.image && <FestivalImage festival={festival} />}
      <FestivalSummaryPanel festival={festival} />
      <button type="button" onClick={onTalk}>
        고래에게 이 행사 물어보기
      </button>
    </div>
  );
}
