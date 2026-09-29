// 예보와 명단이 일치하는 행사를 같은 필터로 집계하고 기존 예보서로 연결한다.
import type { FestivalSummary, Insight } from "@crowdcast/contracts/types";
import { useState } from "react";
import { getFestivals } from "../../lib/api-client";
import type { ContractState } from "../../lib/validation/use-contract";
import {
  countFestivals,
  type FestivalFilters,
  filterFestivals,
  peakDistribution,
  startMonth,
} from "./festival-analysis";
import { FestivalComparison } from "./festival-comparison";
import { InsightDistribution } from "./insight-distribution";
import { matchInsightFestivals } from "./insight-festival-matching";
import { useInsightResource } from "./use-insight-resource";

const EMPTY: FestivalFilters = { month: "", region: "", type: "", query: "" };

// 행사 건수의 분포와 예상 인원 분포를 구분하며 필터가 바뀌면 목록을 처음부터 보여 준다.
export function FestivalOverviewContent({
  festivals,
}: {
  festivals: FestivalSummary[];
}) {
  const [filters, setFilters] = useState(EMPTY);
  const [view, setView] = useState("month");
  const filtered = filterFestivals(festivals, filters);
  const months = [...new Set(festivals.map(startMonth))].sort();
  const regions = [
    ...new Map(
      festivals.map((row) => [row.sigunguCode, row.sigunguName]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "ko"));
  const types = [...new Set(festivals.map((row) => row.type))].sort();
  const charts = {
    month: {
      title: "시작 월별 행사 수",
      rows: countFestivals(filtered, startMonth).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    },
    region: {
      title: "지역별 행사 수",
      rows: countFestivals(
        filtered,
        (row) => `${row.sigunguName} (${row.sigunguCode})`,
        7,
      ),
    },
    type: {
      title: "유형별 행사 수",
      rows: countFestivals(filtered, (row) => row.type),
    },
    peak: {
      title: "순간 최대 동시 인원 추정 · 중앙값 기준",
      rows: peakDistribution(filtered),
    },
  };
  const chart = charts[view as keyof typeof charts];
  const change = (key: keyof FestivalFilters, value: string) => {
    setFilters((old) => ({ ...old, [key]: value }));
  };
  return (
    <div className="insights-section-stack">
      <p>
        저장 예보와 연결된 {festivals.length.toLocaleString("ko-KR")}개
        행사예요. 예정 목록의 지역·시기·유형을 살펴보고 개별 예보를 확인하세요.
      </p>
      <div className="insights-filters">
        <label>
          시작 월
          <select
            value={filters.month}
            onChange={(e) => change("month", e.target.value)}
          >
            <option value="">전체 월</option>
            {months.map((month) => (
              <option key={month}>{month}</option>
            ))}
          </select>
        </label>
        <label>
          지역
          <select
            value={filters.region}
            onChange={(e) => change("region", e.target.value)}
          >
            <option value="">전체 지역</option>
            {regions.map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
        </label>
        <label>
          행사 성격
          <select
            value={filters.type}
            onChange={(e) => change("type", e.target.value)}
          >
            <option value="">전체 성격</option>
            {types.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          행사명 또는 지역 검색
          <input
            type="search"
            value={filters.query}
            onChange={(e) => change("query", e.target.value)}
          />
        </label>
      </div>
      <div className="insights-copy-actions">
        <strong role="status">
          선택한 행사 {filtered.length.toLocaleString("ko-KR")}개 / 전체{" "}
          {festivals.length.toLocaleString("ko-KR")}개
        </strong>
        <button
          type="button"
          onClick={() => {
            setFilters(EMPTY);
          }}
        >
          조건 초기화
        </button>
      </div>
      <fieldset className="insights-view-buttons" aria-label="행사 분석 선택">
        {Object.entries({
          month: "시작 월",
          region: "지역",
          type: "행사 성격",
          peak: "예상 인원 규모",
        }).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      {filtered.length ? (
        <InsightDistribution
          title={chart.title}
          rows={chart.rows}
          size={filtered.length}
          headingLevel={3}
        />
      ) : (
        <p>조건에 맞는 행사가 없어요. 조건을 바꿔 주세요.</p>
      )}
      <p className="insights-caption">
        {view === "peak"
          ? "기존 예보의 순간 최대 동시 인원 중앙값을 만 명 단위로 나눈 설명용 구간이에요. 안전관리 등급·위험 순위가 아니며 미검증 모델의 추정값이에요. 행사별 예측 구간을 함께 확인하세요."
          : view === "type"
            ? "행사 성격은 기존 자료의 공연·먹거리·전통 등의 분류예요. 비슷한 성격의 행사를 찾기 위한 구분이며 안전 등급과는 별개예요."
            : "모든 그래프와 목록에 같은 조건을 적용해요. 월별 건수는 시작일 기준으로 한 번만 세며, 행사 수가 방문객 수나 위험도를 뜻하지는 않아요."}
      </p>
      <details className="insights-details">
        <summary>선택한 행사 목록 · {filtered.length}개</summary>
        <FestivalComparison
          key={JSON.stringify(filters)}
          festivals={filtered}
        />
      </details>
    </div>
  );
}

// 기존 API의 전체 목록과 인사이트 표본을 대조한 뒤에만 통계를 계산한다.
function MatchedOverview({ insight }: { insight: Insight }) {
  const { state, retry } = useInsightResource(getFestivals);
  if (state.status === "loading")
    return <p role="status">행사 자료를 확인하고 있어요.</p>;
  if (state.status !== "ready" || !state.value)
    return (
      <div>
        <p role="alert">행사 자료를 불러오지 못했어요.</p>
        <button type="button" onClick={retry}>
          행사 자료 다시 확인
        </button>
      </div>
    );
  const festivals = matchInsightFestivals(insight, state.value);
  return festivals ? (
    <FestivalOverviewContent festivals={festivals} />
  ) : (
    <p role="status">
      예보와 행사 목록의 대상 일치를 확인할 수 없어 현황 집계를 보류했어요.
    </p>
  );
}

// I2 요청 실패나 빈 표본을 행사 수 0이라는 통계로 잘못 표시하지 않는다.
export function FestivalOverview({ state }: { state: ContractState<Insight> }) {
  if (state.status === "loading")
    return <p role="status">분석 대상을 확인하고 있어요.</p>;
  if (state.status !== "ready" || !state.value)
    return (
      <p>
        예보 자료를 확인한 뒤 행사 현황을 보여 드려요. 아래 예보 영역에서 다시
        조회할 수 있어요.
      </p>
    );
  if (state.value.sampleSize === 0) return <p>집계할 저장 예보가 없어요.</p>;
  return <MatchedOverview key={state.value.computedAt} insight={state.value} />;
}
