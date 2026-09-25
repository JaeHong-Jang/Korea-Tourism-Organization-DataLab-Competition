// 지도·목록에서 고른 행사를 고래 옆 말풍선 카드로 보여 준다 — 목록 아래 중복 요약 대신.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { FestivalSummaryPanel } from "../mini-korea/festival-summary";
import { FestivalImage } from "./recommendation-cards";

// 사진·예보 요약·예보 받기 링크와 닫기를 둔다(링크는 고래 봇 대화로 이어진다).
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
    // 요약의 "이 행사 예보 받기"는 화면을 옮기지 않고 고래 봇 대화에서 이 행사로 예보를 요청한다(T-442와 같은 동작).
    <div
      className="assistant-invitation assistant-spotlight"
      onClickCapture={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest(".festival-summary a")
        ) {
          event.preventDefault();
          onTalk();
        }
      }}
    >
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
    </div>
  );
}
