// 사용자가 펼쳤을 때 분석 대상과 일치하는 행사만 조회하고 기존 예보서로 연결한다.
import type { Insight } from "@crowdcast/contracts/types";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getFestivals } from "../../lib/api-client";
import { analysisDay, LEVEL_NAMES } from "./insight-data";
import { matchInsightFestivals } from "./insight-festival-matching";
import { useInsightResource } from "./use-insight-resource";

// 명단의 일치를 확인한 후 이름·지역 검색과 예보서 링크를 제공한다.
function FestivalList({ insight }: { insight: Insight }) {
  const { state, retry } = useInsightResource(getFestivals);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(10);
  if (state.status === "loading")
    return <p role="status">분석 대상 행사를 확인하고 있어요.</p>;
  if (state.status !== "ready" || !state.value)
    return (
      <div>
        <p role="alert">
          행사 목록을 불러오지 못했어요. 위 분석 결과는 계속 볼 수 있어요.
        </p>
        <button type="button" onClick={retry}>
          행사 목록 다시 확인
        </button>
      </div>
    );
  const festivals = matchInsightFestivals(insight, state.value);
  if (!festivals)
    return (
      <p role="status">
        분석에 사용된 예보와 현재 행사 목록의 일치를 확인할 수 없어요. 서로 다른
        시점의 자료가 섞이지 않도록 명단을 표시하지 않아요.
      </p>
    );
  const filtered = festivals.filter((row) =>
    `${row.name} ${row.sigunguName}`
      .toLocaleLowerCase("ko-KR")
      .includes(query.trim().toLocaleLowerCase("ko-KR")),
  );
  return (
    <div className="insights-section-stack">
      <p className="insights-caption">
        분석에 사용한 예보와 연결되는 현재 행사 목록이에요. 전년 발표 환산
        자료의 별도 명단은 제공되지 않아요.
      </p>
      <label className="insights-search">
        행사명 또는 지역 검색
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(10);
          }}
          placeholder="예: 강남, 불꽃축제"
        />
      </label>
      <p role="status">
        일치한 행사 {festivals.length.toLocaleString("ko-KR")}개 · 검색 결과{" "}
        {filtered.length.toLocaleString("ko-KR")}개
      </p>
      <ul className="insights-festival-list">
        {filtered.slice(0, limit).map((row) => (
          <li key={row.forecastId}>
            <div>
              <Link to={`/f/${encodeURIComponent(row.forecastId)}`}>
                {row.name}
                <span className="sr-only"> 예보서 보기</span>
              </Link>
              <p>
                {row.sigunguName} · {analysisDay(row.startsAt)} ~{" "}
                {analysisDay(row.endsAt)}
              </p>
            </div>
            <div>
              <span>
                {row.level}등급 · {LEVEL_NAMES[row.level - 1]}
              </span>
              <p>
                순간 최대 {row.peakP10.toLocaleString("ko-KR")}~
                {row.peakP90.toLocaleString("ko-KR")}명 · 추정
              </p>
              {row.modelVerdict === "미검증" && (
                <small>모델 사례 검증 전 · 참고용</small>
              )}
            </div>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && (
        <p>일치하는 행사가 없어요. 다른 이름이나 지역으로 검색해 주세요.</p>
      )}
      {limit < filtered.length && (
        <button type="button" onClick={() => setLimit((value) => value + 10)}>
          행사 더 보기
        </button>
      )}
    </div>
  );
}

// 명단은 필요할 때만 불러와 분석 결과의 첫 표시를 지연시키지 않는다.
export function InsightFestivals({ insight }: { insight: Insight }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="insights-details"
      onToggle={(event) => setOpened(event.currentTarget.open)}
    >
      <summary>분석 대상 행사 확인</summary>
      {opened && <FestivalList insight={insight} />}
    </details>
  );
}
