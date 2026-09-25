// 주간 눈금을 드래그하거나 두 키보드 핸들로 움직여 기간 필터를 고른다.
import { type PointerEvent, useState } from "react";
import { periodBounds } from "../../lib/festivals/filter-festivals";
import { useSelectionStore } from "../../lib/selection-store";
import type { Week } from "./weekly-timeline";

// 주 시작일을 포함하는 일요일을 필터 끝 날짜로 바꾼다.
function sunday(start: string): string {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

// 포인터 좌표를 트랙 안의 주 인덱스로 제한한다.
function weekAt(event: PointerEvent<HTMLButtonElement>, count: number): number {
  const bounds = event.currentTarget.getBoundingClientRect();
  return Math.max(
    0,
    Math.min(
      count - 1,
      Math.floor(((event.clientX - bounds.left) / bounds.width) * count),
    ),
  );
}

// 기존 필터 기간을 핸들 위치로 읽고 선택 시 같은 custom 기간 값으로 돌려준다.
export function WeeklyBrush({
  weeks,
  today,
}: {
  weeks: Week[];
  today: string;
}) {
  const period = useSelectionStore((state) => state.filters.period);
  const setFilters = useSelectionStore((state) => state.setFilters);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  if (weeks.length === 0) return null;
  const bounds = periodBounds(period, today);
  const selected: [number, number] | null = bounds
    ? [
        Math.max(
          0,
          weeks.findIndex((week) => sunday(week.start) >= bounds[0]),
        ),
        weeks.reduce(
          (last, week, index) => (week.start <= bounds[1] ? index : last),
          0,
        ),
      ]
    : null;
  const range = drag ?? selected;
  const first = range ? Math.min(...range) : 0;
  const last = range ? Math.max(...range) : weeks.length - 1;

  // 포인터와 키보드가 같은 필터 값으로 끝나도록 주의 월요일~일요일을 기록한다.
  const choose = (from: number, to: number) => {
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    setFilters({
      period: `custom:${weeks[low].start}:${sunday(weeks[high].start)}`,
    });
  };
  return (
    <div className="weekly-brush">
      <div className="weekly-brush__heading">
        <strong>기간 고르기</strong>
        <span>
          {period
            ? `${weeks[first].start} ~ ${sunday(weeks[last].start)}`
            : "전체 기간"}
        </span>
        <button
          type="button"
          disabled={!period}
          onClick={() => setFilters({ period: null })}
        >
          기간 선택 해제
        </button>
      </div>
      <button
        type="button"
        className="weekly-brush__track"
        aria-label="주간 기간을 끌어 선택"
        onPointerDown={(event) => {
          const index = weekAt(event, weeks.length);
          setDrag([index, index]);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag) setDrag([drag[0], weekAt(event, weeks.length)]);
        }}
        onPointerUp={(event) => {
          if (drag) choose(drag[0], weekAt(event, weeks.length));
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        {weeks.map((week, index) => (
          <span
            key={week.start}
            className={
              range && index >= first && index <= last ? "is-selected" : ""
            }
            title={`${week.start} 주 · ${week.total}건`}
          />
        ))}
      </button>
      <div className="weekly-brush__handles">
        <label>
          시작 주{" "}
          <input
            type="range"
            aria-label="기간 시작 주"
            min={0}
            max={weeks.length - 1}
            value={first}
            onChange={(event) =>
              choose(Math.min(Number(event.target.value), last), last)
            }
          />
        </label>
        <label>
          끝 주{" "}
          <input
            type="range"
            aria-label="기간 끝 주"
            min={0}
            max={weeks.length - 1}
            value={last}
            onChange={(event) =>
              choose(first, Math.max(first, Number(event.target.value)))
            }
          />
        </label>
      </div>
    </div>
  );
}
