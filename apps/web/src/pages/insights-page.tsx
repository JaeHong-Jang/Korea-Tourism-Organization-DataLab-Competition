// 검증된 인사이트와 실제 데이터랩 사용 기록만 표시한다.

import { useState } from "react";
import { FeaturePanel } from "../components/common/feature-panel";
import { PageHeading } from "../components/common/page-heading";
import { DatalabSpecTable } from "../features/insights/datalab-spec-table";
import { InsightResults } from "../features/insights/insight-results";
import { useInsightResource } from "../features/insights/use-insight-resource";
import { getInsight, getSpec } from "../lib/validation/api";
import "../features/insights/insights.css";
import "../features/insights/insights-focused.css";

const getFirst = (signal: AbortSignal) => getInsight("I1", signal);
const getSecond = (signal: AbortSignal) => getInsight("I2", signal);

// 인사이트가 없으면 복사 기능도 함께 숨긴다.
export function InsightsPage() {
  const [tab, setTab] = useState<"I1" | "I2" | "sources">("I1");
  const first = useInsightResource(getFirst);
  const second = useInsightResource(getSecond);
  const spec = useInsightResource(getSpec);
  return (
    <div className="page-wrap regular-page insights-page">
      <PageHeading eyebrow="" title="인사이트" description="" />
      <nav className="insights-nav" aria-label="인사이트 보기">
        <button
          id="tab-i1"
          type="button"
          aria-pressed={tab === "I1"}
          onClick={() => setTab("I1")}
        >
          I1 · 발표·관측값 비교
        </button>
        <button
          id="tab-i2"
          type="button"
          aria-pressed={tab === "I2"}
          onClick={() => setTab("I2")}
        >
          I2 · 예상 방문객
        </button>
        <button
          id="tab-sources"
          type="button"
          aria-pressed={tab === "sources"}
          onClick={() => setTab("sources")}
        >
          자료 출처
        </button>
      </nav>
      {tab !== "sources" ? (
        <section
          id={`panel-${tab.toLowerCase()}`}
          aria-label={tab === "I1" ? "I1 발표·관측 자료" : "I2 행사별 예보"}
          className="insights-main"
          data-feature="M7-F1"
        >
          <InsightResults
            first={first.state}
            second={second.state}
            activeKey={tab}
            retryFirst={first.retry}
            retrySecond={second.retry}
          />
        </section>
      ) : (
        <section
          id="panel-sources"
          aria-label="자료 출처"
          className="insights-main"
        >
          <FeaturePanel
            id="M7-F2"
            title="자료 출처"
            description=""
            className="insights-spec"
          >
            <div id="insight-data-sources">
              <details className="insights-source-section" open>
                <summary>I1 · 발표·관측값 비교</summary>
                <DatalabSpecTable
                  state={spec.state}
                  retry={spec.retry}
                  datasetIds={[
                    "ds-datalab-festival-status",
                    "ds-mcst-festival-plans",
                  ]}
                />
              </details>
              <details className="insights-source-section" open>
                <summary>I2 · 예상 방문객</summary>
                <DatalabSpecTable
                  state={spec.state}
                  retry={spec.retry}
                  datasetIds={[
                    "ds-kto-visitors-15101972",
                    "ds-mcst-festival-plans",
                  ]}
                />
              </details>
            </div>
          </FeaturePanel>
        </section>
      )}
    </div>
  );
}
