// 지도·목록에서 고른 행사를 고래 옆 말풍선 카드로 보여 준다 — 목록 아래 중복 요약 대신.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useLayoutEffect, useRef, useState } from "react";
import { FestivalSummaryPanel } from "../mini-korea/festival-summary";
import { FestivalImage } from "./recommendation-cards";
import {
  spotlightPlacement,
  type WhalePoint,
  type WhaleSize,
} from "./whale-position";

// 사진·예보 요약·예보 받기 링크와 닫기를 둔다(링크는 고래 봇 대화로 이어진다).
export function FestivalSpotlight({
  festival,
  onTalk,
  onClose,
  whale,
}: {
  festival: FestivalSummary;
  onTalk: () => void;
  onClose: () => void;
  // 고래 위치·크기 — 있으면 카드를 고래 바로 아래에 붙이고 고래를 따라 움직인다.
  whale?: { point: WhalePoint; size: WhaleSize } | null;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState<WhaleSize | null>(null);
  // 사진·요약 길이에 따라 달라지는 카드 크기를 재어 둔다.
  useLayoutEffect(() => {
    const node = card.current;
    if (!node) return;
    const measure = () =>
      setCardSize({ width: node.offsetWidth, height: node.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const place =
    whale && cardSize
      ? spotlightPlacement(whale.point, whale.size, cardSize)
      : null;
  return (
    // 요약의 "이 행사 예보 받기"는 화면을 옮기지 않고 고래 봇 대화에서 이 행사로 예보를 요청한다(T-442와 같은 동작).
    <div
      ref={card}
      className={`assistant-invitation assistant-spotlight${place ? ` assistant-spotlight--anchored assistant-spotlight--${place.side}` : ""}`}
      style={
        place
          ? {
              left: place.left,
              top: place.top,
              ["--arrow" as string]: `${place.arrow}px`,
            }
          : undefined
      }
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
