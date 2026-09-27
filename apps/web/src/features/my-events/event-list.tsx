// 저장 행사 표의 정렬·상태 필터와 행 선택을 제공한다.
import type { Event, ForecastReport } from "@crowdcast/contracts/types";
import { useState } from "react";
import { LevelBadge } from "../../components/common/level-badge";
import { formatDate } from "../../lib/format";

export type SavedEvent = { event: Event; snapshots: ForecastReport[] };
export type EventStatus = "예정" | "지남" | "실측 입력됨";
export type SortKey = "date" | "level" | "forecast";

// 발행 시각으로 정렬해 최신 스냅샷을 하나로 고른다.
export function orderedSnapshots(snapshots: ForecastReport[]) {
  return [...snapshots].sort((a, b) =>
    a.publishedAt.localeCompare(b.publishedAt),
  );
}

// 예보 결과에서 들어온 경우 그 예보가 속한 행사를 바로 선택한다.
export function eventIdForForecast(
  rows: SavedEvent[],
  forecastId: string | null,
) {
  if (!forecastId) return null;
  return (
    rows.find(({ snapshots }) =>
      snapshots.some((snapshot) => snapshot.forecastId === forecastId),
    )?.event.id ?? null
  );
}

// 기본 정렬과 같은 날짜 순서의 첫 행을 상세 패널에도 선택한다.
export function firstEventIdByDate(rows: SavedEvent[]) {
  return (
    [...rows].sort((a, b) =>
      a.event.startsAt.localeCompare(b.event.startsAt),
    )[0]?.event.id ?? null
  );
}

// 실측 완료는 현재 세션의 저장 성공에 한해 표시한다.
export function eventStatus(
  event: Event,
  actualSaved: boolean,
  now = Date.now(),
): EventStatus {
  if (actualSaved) return "실측 입력됨";
  return Date.parse(event.endsAt) < now ? "지남" : "예정";
}

// 날짜·등급·마지막 발행 시각은 계약 값으로 비교하고 동률은 이름으로 정한다.
export function sortAndFilter(
  rows: SavedEvent[],
  sort: SortKey,
  filter: EventStatus | "전체",
  saved: ReadonlySet<string>,
  now = Date.now(),
) {
  return rows
    .filter(
      ({ event }) =>
        filter === "전체" ||
        eventStatus(event, saved.has(event.id), now) === filter,
    )
    .sort((a, b) => {
      const latestA = a.snapshots.at(-1);
      const latestB = b.snapshots.at(-1);
      const value =
        sort === "date"
          ? a.event.startsAt.localeCompare(b.event.startsAt)
          : sort === "level"
            ? (latestB?.forecast.judgment.level ?? 0) -
              (latestA?.forecast.judgment.level ?? 0)
            : (latestB?.publishedAt ?? "").localeCompare(
                latestA?.publishedAt ?? "",
              );
      return value || a.event.name.localeCompare(b.event.name, "ko");
    });
}

// 이름 단추와 같은 행의 날짜·등급·상태 칸도 그 행사를 선택한다.
export function EventList({
  rows,
  selectedId,
  onSelect,
  saved,
}: {
  rows: SavedEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  saved: ReadonlySet<string>;
}) {
  const [sort, setSort] = useState<SortKey>("date");
  const [filter, setFilter] = useState<EventStatus | "전체">("전체");
  const visible = sortAndFilter(rows, sort, filter, saved);
  return (
    <>
      <div className="my-events-filters">
        <label>
          정렬{" "}
          <select
            aria-label="정렬"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            <option value="date">행사 일자</option>
            <option value="level">등급</option>
            <option value="forecast">마지막 예보</option>
          </select>
        </label>
        <label>
          상태{" "}
          <select
            aria-label="상태 필터"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as EventStatus | "전체")
            }
          >
            <option>전체</option>
            <option>예정</option>
            <option>지남</option>
            <option>실측 입력됨</option>
          </select>
        </label>
      </div>
      {visible.length === 0 ? (
        <p>이 상태의 행사가 없어요.</p>
      ) : (
        <div className="my-events-table-wrap">
          <table className="my-events-table">
            <thead>
              <tr>
                <th scope="col">행사명</th>
                <th scope="col">일자</th>
                <th scope="col">등급</th>
                <th scope="col">상태</th>
                <th scope="col">마지막 예보</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ event, snapshots }) => {
                const latest = snapshots.at(-1);
                return (
                  <tr
                    key={event.id}
                    className={selectedId === event.id ? "is-selected" : ""}
                    aria-selected={selectedId === event.id}
                    onClick={() => onSelect(event.id)}
                  >
                    <th scope="row" data-label="행사명">
                      <button
                        type="button"
                        aria-pressed={selectedId === event.id}
                        onClick={() => onSelect(event.id)}
                      >
                        {event.name}
                      </button>
                    </th>
                    <td data-label="일자">{formatDate(event.startsAt)}</td>
                    <td data-label="등급">
                      {latest ? (
                        <LevelBadge judgment={latest.forecast.judgment} />
                      ) : (
                        "예보 없음"
                      )}
                    </td>
                    <td data-label="상태">
                      {eventStatus(event, saved.has(event.id))}
                    </td>
                    <td data-label="마지막 예보">
                      {latest ? formatDate(latest.publishedAt) : "예보 없음"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
