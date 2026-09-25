// 공유 스냅샷의 판정·수치·근거만 재사용해 읽기 전용 예보서를 그린다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { FeaturePanel } from "../../components/common/feature-panel";
import { ReportDrawer, useEvidenceDrawer } from "../evidence/report-drawer";
import { ReportClaims } from "../forecast-report/report-claims";
import { ReportContext } from "../forecast-report/report-context";
import { ReportJudgment } from "../forecast-report/report-judgment";
import { ReportNumbers } from "../forecast-report/report-numbers";

// 계획·편집·재예보 행동 컴포넌트는 공유 문서에 넣지 않는다.
export function SharedReport({ report }: { report: ForecastReport }) {
  const drawer = useEvidenceDrawer();
  return (
    <div className="document-layout">
      <div className="document-main">
        <FeaturePanel
          id="M5-F5"
          title="발행 예보서"
          description="공유된 예보서 · 읽기 전용"
          className="document-sheet"
        >
          <ReportJudgment report={report} onOpen={drawer.open} />
          <ReportNumbers report={report} onOpen={drawer.open} />
          <ReportClaims
            report={report}
            onOpen={drawer.open}
            exclude={["판정", "권고"]}
          />
          <ReportContext report={report} onOpen={drawer.open} />
          <ol className="report-print-notes" aria-label="근거 각주">
            {report.evidence.map((item) => (
              <li key={item.id}>{item.title}</li>
            ))}
          </ol>
        </FeaturePanel>
      </div>
      <ReportDrawer
        report={report}
        selectedId={drawer.selectedId}
        onClose={drawer.close}
      />
    </div>
  );
}
