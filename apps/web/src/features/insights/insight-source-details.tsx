// 지표별 계산 시각과 출처를 페이지 하단에 모아 중복 설명을 줄인다.
import type { Insight } from "@crowdcast/contracts/types";
import type { ContractState } from "../../lib/validation/use-contract";
import { collectionData } from "./collection-data";
import { CollectionSources } from "./collection-sources";
import { DailyScaleSource } from "./daily-scale-source";
import { analysisTime } from "./insight-data";
import { publicComparisons } from "./public-comparison-data";

// 준비된 지표만 출처에 포함해 다른 지표의 요청 실패가 자료 확인을 막지 않게 한다.
export function InsightSourceDetails({
  first,
  second,
}: {
  first: ContractState<Insight>;
  second: ContractState<Insight>;
}) {
  const insights = [first, second].flatMap((state) =>
    state.status === "ready" && state.value ? [state.value] : [],
  );
  return (
    <section
      className="insights-section-stack"
      aria-label="인사이트 출처와 계산 기록"
    >
      <div className="insights-source-grid">
        {insights.map((insight) => (
          <section key={insight.key}>
            <h3>
              {insight.key} ·{" "}
              {insight.key === "I2"
                ? "일평균 방문객 규모 등급"
                : "과거 행사 발표·관측값 비교"}
            </h3>
            <p>계산 시각: {analysisTime(insight.computedAt)}</p>
            <CollectionSources inventory={collectionData(insight)} />
            <DailyScaleSource insight={insight} />
            <ul>
              {insight.evidence
                .filter((row) => insight.evidenceIds.includes(row.id))
                .map((row) => (
                  <li key={row.id}>
                    {row.source?.accessUrl ? (
                      <a
                        href={row.source.accessUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.title}
                      </a>
                    ) : (
                      row.title
                    )}
                  </li>
                ))}
            </ul>
            {publicComparisons(insight).map((row) => (
              <div key={row.id}>
                <h4>
                  {row.year} · {row.eventName}
                </h4>
                <ul>
                  {row.sources.map((source) => (
                    <li key={source.title}>
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>
                      ) : (
                        source.title
                      )}
                      {source.publishedAt && ` · 공개 ${source.publishedAt}`}
                      {source.file && <p>{source.file}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
