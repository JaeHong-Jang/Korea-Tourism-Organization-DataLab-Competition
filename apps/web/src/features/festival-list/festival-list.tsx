// 행사 목록을 키보드와 포인터로 선택해 3D 판의 공개 선택 상태와 맞춘다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { CalendarDays, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RangeBar } from "../../components/charts/range-bar";
import { EmptyState } from "../../components/common/empty-state";
import { ErrorState } from "../../components/common/error-state";
import { LevelBadge } from "../../components/common/level-badge";
import { formatDate } from "../../lib/format";
import { useSelectionStore } from "../../lib/selection-store";
import { type FestivalSort, sortFestivals } from "./sort-festivals";

const labels = ["소규모", "수립 권고", "수립 대상", "대규모"] as const;

// 선택이 지도에서 들어와도 카드가 보이는 위치까지 스크롤한다.
export function FestivalList({
  festivals,
  status,
}: {
  festivals: FestivalSummary[];
  status: string;
}) {
  const [sort, setSort] = useState<FestivalSort>("risk");
  const ordered = useMemo(
    () => sortFestivals(festivals, sort),
    [festivals, sort],
  );
  const selectedId = useSelectionStore((state) => state.selectedFestivalId);
  const selectFestival = useSelectionStore((state) => state.selectFestival);
  const selectSigungu = useSelectionStore((state) => state.selectSigungu);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  useEffect(() => {
    if (
      selectedId &&
      ordered.some((festival) => festival.eventId === selectedId)
    ) {
      itemRefs.current
        .get(selectedId)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId, ordered]);

  // 카드 선택은 공개 스토어 동작 두 개를 호출해 판과 목록을 동기화한다.
  const pick = (festival: FestivalSummary) => {
    selectFestival(festival.eventId);
    selectSigungu(festival.sigunguCode);
  };
  const move = (index: number, direction: number) => {
    const next = ordered[(index + direction + ordered.length) % ordered.length];
    if (next) {
      pick(next);
      itemRefs.current.get(next.eventId)?.querySelector("button")?.focus();
    }
  };

  return (
    <div className="festival-list">
      <div className="festival-list__tools">
        <span>
          {status === "loading"
            ? "목록 확인 중"
            : status === "error"
              ? "목록 확인 필요"
              : `${festivals.length}건`}
        </span>
        <label>
          정렬{" "}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as FestivalSort)}
          >
            <option value="risk">위험 순</option>
            <option value="date">날짜 순</option>
          </select>
        </label>
      </div>
      {status === "loading" ? (
        <p role="status">행사 예보를 불러오는 중이에요.</p>
      ) : status === "error" ? (
        <ErrorState
          message="행사 예보의 형식을 확인할 수 없어요."
          action={<span>잠시 뒤 다시 확인해 주세요.</span>}
        />
      ) : ordered.length === 0 ? (
        <EmptyState
          message={
            status === "unavailable"
              ? "예보가 준비되면 여기에 나타나요"
              : "선택한 조건의 행사가 없어요."
          }
          action={
            <span>
              {status === "unavailable"
                ? "잠시 뒤 다시 확인해 주세요."
                : "필터를 바꿔 보세요."}
            </span>
          }
        />
      ) : (
        <ol className="festival-list__items" aria-label="행사 목록">
          {ordered.map((festival, index) => (
            <li
              key={festival.eventId}
              ref={(node) => {
                if (node) itemRefs.current.set(festival.eventId, node);
                else itemRefs.current.delete(festival.eventId);
              }}
              className={selectedId === festival.eventId ? "is-selected" : ""}
            >
              <button
                type="button"
                className="festival-list__pick"
                aria-pressed={selectedId === festival.eventId}
                onClick={() => pick(festival)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    move(index, event.key === "ArrowDown" ? 1 : -1);
                  }
                }}
              >
                <strong>{festival.name}</strong>
                <span>
                  <CalendarDays size={14} aria-hidden="true" />
                  {formatDate(festival.startsAt)}
                </span>
                <span>
                  <MapPin size={14} aria-hidden="true" />
                  {festival.sigunguName}
                </span>
                <LevelBadge
                  judgment={{
                    level: festival.level,
                    label: labels[festival.level - 1],
                  }}
                  provisional={festival.ood}
                />
              </button>
              <RangeBar range={festival} mini />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
