// S1 행사 조건을 선택 스토어에 저장하고 적용된 조건 수를 보여 준다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { festivalSido } from "../../lib/festivals/filter-festivals";
import { useSelectionStore } from "../../lib/selection-store";

const types = ["불꽃", "공연", "대학", "먹거리", "꽃", "전통", "기타"];
const levels = ["소규모", "수립 권고", "수립 대상", "대규모"];

// 직접 지정한 날짜는 다른 패널이 읽을 수 있도록 하나의 기간 값으로 보관한다.
export function FestivalFiltersPanel({ all }: { all: FestivalSummary[] }) {
  const filters = useSelectionStore((state) => state.filters);
  const setFilters = useSelectionStore((state) => state.setFilters);
  const clearFilters = useSelectionStore((state) => state.clearFilters);
  const period = filters.period?.startsWith("custom:")
    ? "custom"
    : (filters.period ?? "");
  const [, from = "", to = ""] = filters.period?.startsWith("custom:")
    ? filters.period.split(":")
    : [];
  const applied = Object.values(filters).filter(
    (value) => value !== null,
  ).length;
  const sidos = [...new Set(all.map(festivalSido))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );

  return (
    <div className="festival-filters">
      <label>
        기간
        <select
          value={period}
          onChange={(event) =>
            setFilters({
              period:
                event.target.value === "custom"
                  ? "custom::"
                  : event.target.value || null,
            })
          }
        >
          <option value="">전체 기간</option>
          <option value="week">이번 주</option>
          <option value="two-weeks">2주</option>
          <option value="month">한 달</option>
          <option value="custom">직접</option>
        </select>
      </label>
      {period === "custom" && (
        <div className="festival-filters__dates">
          <label>
            시작일
            <input
              type="date"
              value={from}
              onChange={(event) =>
                setFilters({ period: `custom:${event.target.value}:${to}` })
              }
            />
          </label>
          <label>
            종료일
            <input
              type="date"
              min={from || undefined}
              value={to}
              onChange={(event) =>
                setFilters({ period: `custom:${from}:${event.target.value}` })
              }
            />
          </label>
        </div>
      )}
      <label>
        시도
        <select
          value={filters.sido ?? ""}
          onChange={(event) => setFilters({ sido: event.target.value || null })}
        >
          <option value="">전국</option>
          {sidos.map((sido) => (
            <option key={sido} value={sido}>
              {sido}
            </option>
          ))}
        </select>
      </label>
      <label>
        유형
        <select
          value={filters.type ?? ""}
          onChange={(event) => setFilters({ type: event.target.value || null })}
        >
          <option value="">전체 유형</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        등급
        <select
          value={filters.level ?? ""}
          onChange={(event) =>
            setFilters({
              level: event.target.value ? Number(event.target.value) : null,
            })
          }
        >
          <option value="">전체 등급</option>
          {levels.map((label, index) => (
            <option key={label} value={index + 1}>
              {index + 1}등급 · {label}
            </option>
          ))}
        </select>
      </label>
      <div className="festival-filters__actions">
        <span>적용 {applied}개</span>
        <button type="button" onClick={clearFilters} disabled={applied === 0}>
          모두 초기화
        </button>
      </div>
    </div>
  );
}
