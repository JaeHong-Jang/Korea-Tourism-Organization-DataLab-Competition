// 행사 요약 계약을 크기별 카드로 보여 주고 예보서 이동을 제공한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { CalendarDays, MapPin } from "lucide-react";
import { formatDate } from "../../lib/format";
import { RangeBar } from "../charts/range-bar";
import { ComponentState, type ComponentStatus } from "./component-state";
import { LevelBadge } from "./level-badge";

// 장소와 시각은 계약 값을 쓰고 compact에서도 등급과 구간을 유지한다.
export function FestivalCard({
  festival,
  variant = "regular",
  status = "ready",
}: {
  festival?: FestivalSummary | null;
  variant?: "compact" | "regular";
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !festival)
    return (
      <ComponentState
        name="행사"
        status={status === "ready" ? "empty" : status}
      />
    );
  const labels = ["소규모", "수립 권고", "수립 대상", "대규모"] as const;
  return (
    <article
      className={`kit-card festival-card festival-card--${variant}`}
      aria-label={festival.name}
    >
      <span className="kit-label">{festival.type} 행사</span>
      <h3>
        <a href={`/f/${encodeURIComponent(festival.forecastId)}`}>
          {festival.name}
        </a>
      </h3>
      <p>
        <CalendarDays size={15} aria-hidden="true" />
        {formatDate(festival.startsAt)}
      </p>
      <p>
        <MapPin size={15} aria-hidden="true" />
        {festival.sigunguName}
      </p>
      <LevelBadge
        judgment={{
          level: festival.level,
          label: labels[festival.level - 1] ?? "소규모",
        }}
        provisional={festival.ood}
      />
      <RangeBar range={festival} mini />
    </article>
  );
}
