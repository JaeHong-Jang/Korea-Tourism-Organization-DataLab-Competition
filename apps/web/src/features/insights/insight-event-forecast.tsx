// 행사 하나의 하루 평균과 최대 동시 인원을 각기 다른 단위의 구간 그래프로 보여 준다.
import type { Insight } from "@crowdcast/contracts/types";
import { useState } from "react";
import { Link } from "react-router-dom";
import { forecastPeople, type PeopleRange } from "./forecast-people-data";

// 막대에 중앙 예측값, 선에 예측 범위를 겹쳐 숫자와 함께 제공한다.
function PeopleChart({ title, value }: { title: string; value: PeopleRange }) {
  const max = Math.max(1, value.p90);
  const y = (number: number) => 155 - (number / max) * 125;
  const number = (n: number) => n.toLocaleString("ko-KR");
  return (
    <section className="insights-comparison-card" aria-label={title}>
      <h3>{title}</h3>
      <strong>
        {number(value.p50)} {value.unit}
      </strong>
      <p>
        예측 범위 {number(value.p10)}~{number(value.p90)} {value.unit}
      </p>
      <svg
        className="insights-daily-chart"
        viewBox="0 0 300 190"
        role="img"
        aria-label={`${title}: 예측 중앙값 ${number(value.p50)} ${value.unit}, 범위 ${number(value.p10)}~${number(value.p90)} ${value.unit}`}
      >
        <line x1="55" y1="155" x2="245" y2="155" stroke="currentColor" />
        <text x="48" y="34" textAnchor="end" fill="currentColor" fontSize="12">
          {number(max)}
        </text>
        <text x="48" y="159" textAnchor="end" fill="currentColor" fontSize="12">
          0
        </text>
        <rect
          x="115"
          y={y(value.p50)}
          width="70"
          height={155 - y(value.p50)}
          fill="var(--brand)"
          opacity=".78"
        />
        <line
          x1="150"
          y1={y(value.p90)}
          x2="150"
          y2={y(value.p10)}
          stroke="var(--ink)"
          strokeWidth="2"
        />
        <line
          x1="138"
          y1={y(value.p90)}
          x2="162"
          y2={y(value.p90)}
          stroke="var(--ink)"
          strokeWidth="2"
        />
        <line
          x1="138"
          y1={y(value.p10)}
          x2="162"
          y2={y(value.p10)}
          stroke="var(--ink)"
          strokeWidth="2"
        />
        <circle cx="150" cy={y(value.p50)} r="5" fill="var(--ink)" />
        <text
          x="150"
          y="180"
          textAnchor="middle"
          fill="currentColor"
          fontSize="12"
        >
          예측 중앙값
        </text>
      </svg>
    </section>
  );
}

// 검색 결과에 있는 행사만 선택하고 빈 검색을 이전 행사 숫자로 채우지 않는다.
export function InsightEventForecast({ insight }: { insight: Insight }) {
  const rows = forecastPeople(insight);
  const [query, setQuery] = useState("");
  const [id, setId] = useState("");
  if (!rows) return <p role="status">행사별 인원 자료를 확인할 수 없어요.</p>;
  const filtered = rows.filter((row) =>
    row.name
      .toLocaleLowerCase("ko-KR")
      .includes(query.trim().toLocaleLowerCase("ko-KR")),
  );
  const selected = filtered.find((row) => row.forecastId === id) ?? filtered[0];
  return (
    <section className="insights-section-stack" aria-label="행사별 방문객 예측">
      <label className="insights-search">
        행사 검색
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setId("");
          }}
        />
      </label>
      <label className="insights-search">
        행사 선택
        <select
          aria-label="예측을 볼 행사"
          value={selected?.forecastId ?? ""}
          onChange={(event) => setId(event.target.value)}
          disabled={!selected}
        >
          {filtered.map((row) => (
            <option key={row.forecastId} value={row.forecastId}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <>
          <p>
            {selected.start} ~ {selected.end}
          </p>
          <div className="insights-people-charts">
            <PeopleChart title="하루 평균 방문객" value={selected.dailyMean} />
            <PeopleChart
              title="가장 붐빌 때 동시 인원"
              value={selected.peakConcurrent}
            />
          </div>
          <p className="insights-caption">
            막대·점은 중앙값, 선은 하위 10%~상위 10% 예측 범위예요. 두 그래프의
            단위는 달라요.
          </p>
          <p>
            동시 인원은 체류 등의 가정을 적용한 추정이에요. 사고 위험률이나 혼잡
            시간대를 뜻하지 않아요.
          </p>
          <Link to={`/f/${encodeURIComponent(selected.forecastId)}`}>
            선택한 행사 예보 보기
          </Link>
        </>
      ) : (
        <p role="status">검색한 행사가 없어요.</p>
      )}
    </section>
  );
}
