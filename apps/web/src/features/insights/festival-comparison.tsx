// 같은 표본 안에서 행사 세 개의 예상 인원과 예측 구간을 직접 비교한다.
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { useState } from "react";
import { Link } from "react-router-dom";
import { analysisDay } from "./insight-data";

// 중앙값 정렬은 탐색 도구이며 안전도나 실제 방문 규모의 순위로 해석하지 않는다.
export function FestivalComparison({
  festivals,
}: {
  festivals: FestivalSummary[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [order, setOrder] = useState("date");
  const [limit, setLimit] = useState(5);
  const rows = [...festivals].sort((a, b) =>
    order === "peak"
      ? b.peakP50 - a.peakP50 || a.startsAt.localeCompare(b.startsAt)
      : a.startsAt.localeCompare(b.startsAt) ||
        a.name.localeCompare(b.name, "ko"),
  );
  const compared = selected
    .map((id) => festivals.find((row) => row.forecastId === id))
    .filter((row): row is FestivalSummary => Boolean(row));
  const maximum = Math.max(1, ...compared.map((row) => row.peakP90));
  const identical =
    compared.length > 1 &&
    new Set(
      compared.map((row) => `${row.peakP10}/${row.peakP50}/${row.peakP90}`),
    ).size === 1;
  // 선택 해제는 항상 가능하게 하고 새로운 선택만 세 개로 제한한다.
  const toggle = (id: string) =>
    setSelected((old) =>
      old.includes(id)
        ? old.filter((item) => item !== id)
        : old.length < 3
          ? [...old, id]
          : old,
    );
  return (
    <section
      className="insights-section-stack"
      aria-label="행사별 예상 인원 비교"
    >
      <h3>등급과 함께 예상 인원을 비교하세요</h3>
      <p>
        행사를 최대 3개 선택해 순간 최대 동시 인원의 중앙값과 추정 구간을
        비교하세요. 필터를 바꾸면 선택이 초기화돼요.
      </p>
      {identical && (
        <p role="status">
          선택한 행사들의 예측값이 같아요. 이 예보만으로 규모 차이를 구분할 수
          없어요.
        </p>
      )}
      <div className="insights-comparison-toolbar">
        <label>
          행사 정렬
          <select
            value={order}
            onChange={(e) => {
              setOrder(e.target.value);
              setLimit(5);
            }}
          >
            <option value="date">개최일 순</option>
            <option value="peak">예상 인원 중앙값 큰 순</option>
          </select>
        </label>
        <span role="status">비교 선택 {compared.length}/3개</span>
        {compared.length > 0 && (
          <button type="button" onClick={() => setSelected([])}>
            비교 선택 해제
          </button>
        )}
      </div>
      {compared.length > 0 && (
        <div className="insights-comparison-cards">
          {compared.map((row) => (
            <article className="insights-comparison-card" key={row.forecastId}>
              <h4>{row.name}</h4>
              <p>
                {row.sigunguName} · {analysisDay(row.startsAt)}
                <br />
                {row.level}등급 · {row.type}
              </p>
              <dl>
                <div>
                  <dt>순간 최대 중앙값</dt>
                  <dd>{row.peakP50.toLocaleString("ko-KR")}명</dd>
                </div>
                <div>
                  <dt>추정 구간</dt>
                  <dd>
                    {row.peakP10.toLocaleString("ko-KR")}~
                    {row.peakP90.toLocaleString("ko-KR")}명
                  </dd>
                </div>
              </dl>
              <div className="insights-range" aria-hidden="true">
                <span
                  style={{
                    left: `${(row.peakP10 / maximum) * 100}%`,
                    width: `${((row.peakP90 - row.peakP10) / maximum) * 100}%`,
                  }}
                />
                <i style={{ left: `${(row.peakP50 / maximum) * 100}%` }} />
              </div>
              <Link to={`/f/${encodeURIComponent(row.forecastId)}`}>
                예보와 근거 확인<span className="sr-only"> · {row.name}</span>
              </Link>
              <button
                type="button"
                onClick={() => toggle(row.forecastId)}
                aria-label={`${row.name} 비교에서 제외`}
              >
                선택 해제
              </button>
            </article>
          ))}
        </div>
      )}
      {compared.length > 0 && (
        <p className="insights-caption">
          막대는 모두 0~{maximum.toLocaleString("ko-KR")}명의 같은 축이에요. 색
          막대는 추정 구간, 세로선은 중앙값이에요. 구간이 겹치면 어느 행사가
          실제로 더 붐빌지 단정할 수 없어요. 모델은 미검증이며 방문객 누적
          합계나 위험 순위가 아니에요.
        </p>
      )}
      <ul className="insights-festival-list">
        {rows.slice(0, limit).map((row) => (
          <li key={row.forecastId}>
            <div>
              <label className="insights-compare-check">
                <input
                  type="checkbox"
                  checked={selected.includes(row.forecastId)}
                  disabled={
                    selected.length >= 3 && !selected.includes(row.forecastId)
                  }
                  onChange={() => toggle(row.forecastId)}
                />
                {row.name} 비교
              </label>
              <p>
                {row.sigunguName} · {analysisDay(row.startsAt)} ~{" "}
                {analysisDay(row.endsAt)}
              </p>
              <Link to={`/f/${encodeURIComponent(row.forecastId)}`}>
                예보서 보기<span className="sr-only"> · {row.name}</span>
              </Link>
            </div>
            <div>
              <p>순간 최대 중앙값 {row.peakP50.toLocaleString("ko-KR")}명</p>
              <p>
                추정 구간 {row.peakP10.toLocaleString("ko-KR")}~
                {row.peakP90.toLocaleString("ko-KR")}명
              </p>
              <small>{row.level}등급 · 참고용</small>
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p>조건에 맞는 비교 대상이 없어요.</p>}
      {limit < rows.length && (
        <button type="button" onClick={() => setLimit((old) => old + 10)}>
          행사 더 보기
        </button>
      )}
    </section>
  );
}
